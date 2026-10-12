// tools/nl-search.tool.ts — 自然语言地图搜索工具 (MapTool)
// 解析"故宫附近有哪些公园"、"台北最高的山"等中文自然语言查询，
// 转换为 Nominatim + Overpass 结构化搜索

import { getEngine } from '../hooks/useMap';
import { searchPlaces, queryNearbyPOIs } from '../core/geocode';
import type { NearbyPOI } from '../core/geocode';
import type { MapTool, ToolContext } from '../core/tools';

// ---- NL 解析正则 ----

/** "X附近有哪些Y" / "X周边的Y" / "X旁边的Y" / "X附近有没有Y" */
const NEARBY_RE = /(.{1,30})(?:附近|周边|旁边).{0,5}(?:有哪些|有什么|有没有|的|有)(.{1,20})/;

/** "X最高的Y" / "X最大的Y" / "X最老的Y" / "X最著名的Y" / "X最适合Y的Z" */
const SUPERLATIVE_RE = /(.{1,30})(?:最高|最大|最老|最著名|最适合|最好|最美|最漂亮)(?:的)?(.{1,15})/;

/** "X有什么Y" / "X的Y" — 更模糊的查询 */
const HAS_RE = /(.{1,30})(?:有什么|的|有哪些)(.{1,20})/;

/** 单项查询："X在哪里" / "去X" / "找X" */
const WHERE_RE = /(.{1,30})(?:在哪里|怎么去|怎么走|在哪儿)/;
const FIND_RE = /^(?:去|找|搜索?|帮我找)(.{1,30})/;

// ---- 关键词映射（大幅扩展） ----

/** POI 类别 → OSM tag 关键词列表 */
const KW_TAG_MAP: Record<string, string[]> = {
  // 自然地貌
  '山': ['peak', 'volcano', 'mountain'],
  '山峰': ['peak', 'volcano'],
  '湖': ['lake', 'water'],
  '湖泊': ['lake', 'water'],
  '河': ['river', 'stream', 'waterway'],
  '河流': ['river', 'stream'],
  '海': ['beach', 'coastline', 'bay'],
  '森林': ['forest', 'wood', 'nature_reserve'],
  '峡谷': ['gorge', 'canyon', 'valley'],

  // 休闲出行
  '公园': ['park', 'garden', 'playground', 'nature_reserve'],
  '花园': ['garden', 'park'],
  '景点': ['attraction', 'viewpoint', 'museum', 'theme_park', 'zoo'],
  '景区': ['attraction', 'viewpoint', 'nature_reserve'],
  '博物馆': ['museum'],
  '动物园': ['zoo'],
  '游乐场': ['theme_park', 'playground'],
  '广场': ['square', 'plaza'],

  // 餐饮
  '餐厅': ['restaurant', 'cafe', 'fast_food', 'food_court', 'pub'],
  '饭馆': ['restaurant'],
  '咖啡': ['cafe', 'coffee_shop'],
  '小吃': ['fast_food', 'food_court'],
  '美食': ['restaurant', 'cafe', 'fast_food'],
  '好吃': ['restaurant', 'cafe', 'fast_food'],

  // 交通
  '地铁': ['subway_entrance', 'station'],
  '车站': ['bus_stop', 'station', 'bus_station'],
  '公交': ['bus_stop', 'bus_station'],
  '火车站': ['station'],
  '机场': ['aerodrome'],
  '停车场': ['parking'],

  // 生活服务
  '医院': ['hospital', 'clinic'],
  '诊所': ['clinic', 'doctors'],
  '药店': ['pharmacy'],
  '学校': ['school', 'university', 'college'],
  '大学': ['university', 'college'],
  '图书馆': ['library'],
  '商场': ['mall', 'supermarket', 'department_store'],
  '超市': ['supermarket', 'convenience'],
  '酒店': ['hotel', 'motel'],
  '宾馆': ['hotel', 'motel'],
  '银行': ['bank', 'atm'],
  '厕所': ['toilets'],
  '加油站': ['fuel'],
};

/**
 * 从复合短语中提取核心关键词。
 * 如 "适合徒步的山" → "山"; "好吃的餐厅" → "餐厅"
 */
function extractKeywords(phrase: string): string[] {
  const stripped = phrase
    .replace(/^(?:适合|可以|能|好玩的|好看的|有名的|不错的|附近的)/, '')
    .replace(/(?:的|了|吗|呢|吧|啊|呀)$/, '');

  // 精确匹配
  if (KW_TAG_MAP[stripped]) return [stripped];

  // 子串匹配（取最长匹配）
  const matches: string[] = [];
  for (const kw of Object.keys(KW_TAG_MAP)) {
    if (stripped.includes(kw)) matches.push(kw);
  }
  // 按长度降序（优先长关键词 "火车站" > "站"）
  matches.sort((a, b) => b.length - a.length);
  return matches.length > 0 ? matches : [stripped];
}

/** 查找关键词对应的 OSM tag 列表 */
function lookupTags(keyword: string): string[] {
  // 精确匹配
  if (KW_TAG_MAP[keyword]) return KW_TAG_MAP[keyword]!;

  // 模糊匹配：keyword 包含已知关键词
  for (const [kw, tags] of Object.entries(KW_TAG_MAP)) {
    if (keyword.includes(kw)) return tags;
  }

  // 返回原词作为 fallback
  return [keyword.toLowerCase()];
}

// ---- 结果类型 ----

export interface NLSearchResult {
  displayName: string;
  lngLat: [number, number];
  category: string;
  type: string;
  distance?: number;   // meters, for nearby results
  importance?: number;
}

// ---- 回调类型 ----

export type NLResultCallback = (results: NLSearchResult[]) => void;
export type NLProgressCallback = (message: string, percent: number) => void;

// ---- 工具类 ----

export class NLSearchTool implements MapTool {
  readonly id = 'nl-search';
  readonly name = '地标与周边搜索';
  readonly icon = '💬';
  readonly category = 'navigation';
  readonly description = '基于关键词规则搜索地标与周边分类（如"故宫附近的公园"、"台北最高的山"）';
  readonly exclusive = true;

  private active = false;
  private abortController: AbortController | null = null;
  private _onResult: NLResultCallback | null = null;
  private _onProgress: NLProgressCallback | null = null;

  // ---- 回调注册 ----

  set onResult(cb: NLResultCallback | null) {
    this._onResult = cb;
  }

  set onProgress(cb: NLProgressCallback | null) {
    this._onProgress = cb;
  }

  // ---- 公开搜索方法 ----

  async search(query: string): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) return;

    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.reportProgress('正在分析查询意图…', 10);

    try {
      let results: NLSearchResult[] = [];

      // 1. "X附近/周边/旁边有Y"
      const nearbyMatch = trimmed.match(NEARBY_RE);
      if (nearbyMatch) {
        results = await this.handleNearby(nearbyMatch[1].trim(), nearbyMatch[2].trim(), signal);
      }

      // 2. "X最高/最大/最适合的Y"
      if (results.length === 0) {
        const superlativeMatch = trimmed.match(SUPERLATIVE_RE);
        if (superlativeMatch) {
          results = await this.handleSuperlative(
            superlativeMatch[1].trim(), superlativeMatch[2].trim(), trimmed, signal,
          );
        }
      }

      // 3. "X的Y" / "X有什么Y"
      if (results.length === 0) {
        const hasMatch = trimmed.match(HAS_RE);
        if (hasMatch) {
          results = await this.handleHas(hasMatch[1].trim(), hasMatch[2].trim(), signal);
        }
      }

      // 4. "X在哪里 / 怎么去X"
      if (results.length === 0) {
        const whereMatch = trimmed.match(WHERE_RE);
        if (whereMatch) {
          results = await this.handleFallback(whereMatch[1].trim(), signal);
        }
      }

      // 5. "去X / 找X"
      if (results.length === 0) {
        const findMatch = trimmed.match(FIND_RE);
        if (findMatch) {
          results = await this.handleFallback(findMatch[1].trim(), signal);
        }
      }

      // 6. Fallback: 直接 Nominatim 搜索全文（截取前 30 字防过长）
      if (results.length === 0) {
        const shortQuery = trimmed.length > 30
          ? trimmed.replace(/[，。！？、；：""''（）\s]/g, ' ').slice(0, 30)
          : trimmed;
        results = await this.handleFallback(shortQuery, signal);
      }

      if (signal.aborted) return;

      this.reportProgress(`找到 ${results.length} 个结果`, 100);
      this._onResult?.(results);

      // 如果有结果，自动飞到第一个
      if (results.length > 0) {
        const engine = getEngine();
        engine?.flyTo(results[0].lngLat, 13);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('[NLSearchTool] 搜索失败:', err);
      this._onResult?.([]);
    }
  }

  // ---- 处理"附近"模式 ----

  private async handleNearby(
    locationName: string,
    poiType: string,
    signal: AbortSignal,
  ): Promise<NLSearchResult[]> {
    this.reportProgress(`正在定位"${locationName}"…`, 25);

    // Step 1: 搜索地点 X
    const places = await searchPlaces(locationName, 1, signal);
    if (signal.aborted) return [];
    if (places.length === 0) return [];

    const place = places[0];
    this.reportProgress(`正在搜索"${locationName}"周边的"${poiType}"…`, 50);

    // Step 2: 查询周边 POI
    const poiResults = await this.searchPOIByKeyword(poiType, place.lngLat, signal);
    if (signal.aborted) return [];

    return poiResults.map((poi) => ({
      displayName: poi.name,
      lngLat: poi.lngLat,
      category: poi.category,
      type: poi.type,
      distance: poi.distance,
    }));
  }

  // ---- 处理"最高/最大"模式 ----

  private async handleSuperlative(
    areaName: string,
    targetType: string,
    _fullQuery: string,
    signal: AbortSignal,
  ): Promise<NLSearchResult[]> {
    this.reportProgress(`正在定位"${areaName}"…`, 25);

    // Step 1: 搜索区域 X
    const places = await searchPlaces(areaName, 1, signal);
    if (signal.aborted) return [];
    if (places.length === 0) return [];

    const place = places[0];
    this.reportProgress(`正在搜索"${areaName}"的"${targetType}"…`, 50);

    // Step 2: 在区域附近搜索目标类型，按重要性/距离排序
    const poiResults = await this.searchPOIByKeyword(targetType, place.lngLat, signal, 10000);
    if (signal.aborted) return [];

    // 按 importance/tags 排序（最高/最大优先）
    return poiResults
      .sort((a, b) => {
        // 优先按 tags 中的 elevation/height 排序
        const aH = parseFloat(a.tags?.ele ?? a.tags?.height ?? '0');
        const bH = parseFloat(b.tags?.ele ?? b.tags?.height ?? '0');
        if (aH || bH) return bH - aH;
        // 其次按距离倒序（更远的可能更大/更高）
        return a.distance - b.distance;
      })
      .slice(0, 10)
      .map((poi) => ({
        displayName: poi.name,
        lngLat: poi.lngLat,
        category: poi.category,
        type: poi.type,
        distance: poi.distance,
      }));
  }

  // ---- 处理"有什么/的"模式 ----

  private async handleHas(
    locationName: string,
    targetType: string,
    signal: AbortSignal,
  ): Promise<NLSearchResult[]> {
    this.reportProgress(`正在定位"${locationName}"…`, 25);

    const places = await searchPlaces(locationName, 1, signal);
    if (signal.aborted) return [];
    if (places.length === 0) return [];

    const place = places[0];
    this.reportProgress(`正在搜索"${locationName}"周边的"${targetType}"…`, 50);

    const poiResults = await this.searchPOIByKeyword(targetType, place.lngLat, signal);
    if (signal.aborted) return [];

    return poiResults.map((poi) => ({
      displayName: poi.name,
      lngLat: poi.lngLat,
      category: poi.category,
      type: poi.type,
      distance: poi.distance,
    }));
  }

  // ---- Fallback ----

  private async handleFallback(
    query: string,
    signal: AbortSignal,
  ): Promise<NLSearchResult[]> {
    this.reportProgress(`正在搜索"${query}"…`, 30);

    const results = await searchPlaces(query, 10, signal);
    if (signal.aborted) return [];

    return results.map((r) => ({
      displayName: r.displayName,
      lngLat: r.lngLat,
      category: r.category,
      type: r.type,
      importance: r.importance,
    }));
  }

  // ---- 辅助：按关键词搜索 POI ----

  private async searchPOIByKeyword(
    keyword: string,
    center: [number, number],
    signal: AbortSignal,
    radius = 5000,
  ): Promise<NearbyPOI[]> {
    // 提取核心关键词（如 "适合徒步的山" → "山"）
    const coreKeywords = extractKeywords(keyword);
    this.reportProgress(`识别到关键词: ${coreKeywords.join(', ')}…`, 45);

    // 用 Overpass 搜索全部 POI 类别
    const allPois = await queryNearbyPOIs(
      center, radius,
      ['transport', 'food', 'shopping', 'leisure', 'education', 'health'],
      signal,
    );
    if (allPois.length === 0) return [];

    // 收集所有匹配的 OSM tag
    const matchTags = new Set<string>();
    for (const kw of coreKeywords) {
      for (const tag of lookupTags(kw)) {
        matchTags.add(tag);
      }
    }
    const tagList = [...matchTags];

    // 过滤
    const filtered = allPois.filter((poi) => {
      const name = (poi.name ?? '').toLowerCase();
      const cat  = (poi.category ?? '').toLowerCase();
      const type = (poi.type ?? '').toLowerCase();
      const tags = poi.tags ?? {};
      const allText = `${name} ${cat} ${type} ${Object.values(tags).join(' ')}`;

      return tagList.some((tag) => allText.includes(tag.toLowerCase()));
    });

    return filtered.length > 0 ? filtered.slice(0, 30) : allPois.slice(0, 20);
  }

  // ---- 进度上报 ----

  private reportProgress(message: string, percent: number): void {
    this._onProgress?.(message, percent);
  }

  // ---- MapTool 接口 ----

  activate(_ctx: ToolContext): void {
    this.active = true;
  }

  deactivate(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }
}
