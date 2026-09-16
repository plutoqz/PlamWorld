// core/admin-boundary.ts — 行政区图层数据核心管理模块 (升级版)
//
// 整合全球国家高清边界 (Natural Earth 50m)、中国高精省级行政边界、
// 全国地级市与区县级索引树与按需下钻加载、以及国际主要大都市区数据集。

import type { Feature, FeatureCollection, Polygon, MultiPolygon, Position } from 'geojson';
import type { LngLat, LngLatBounds } from './types';
import countriesData from '../data/boundaries/countries-110m.json';
import chinaProvincesData from '../data/boundaries/china-provinces.json';
import chinaAdminTreeData from '../data/boundaries/china-admin-tree.json';
import globalCitiesData from '../data/boundaries/global-cities.json';

// ---- 类型定义 ----

export type AdminLevel = 'country' | 'province' | 'city' | 'county' | 'global-city' | 'border';

export interface AdminRegion {
  id: string;
  name: string;
  nameZh: string;
  nameEn: string;
  level: AdminLevel;
  code: string;
  center: LngLat;
  bounds: LngLatBounds;
  parentName?: string;
  parentCode?: string;
  capital?: string;
  short?: string;
  continent?: string;
  feature?: Feature<Polygon | MultiPolygon>;
}

export interface BoundaryLayerFilter {
  showCountries: boolean;
  showProvinces: boolean;
  showGlobalCities: boolean;
  activeSubdivisions?: AdminRegion[];
}

// ---- 辅助计算函数 ----

export function computeFeatureBounds(geometry: Polygon | MultiPolygon): {
  bounds: LngLatBounds;
  center: LngLat;
} {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  let sumLng = 0;
  let sumLat = 0;
  let count = 0;

  const processRing = (ring: Position[]) => {
    for (const p of ring) {
      const lng = p[0];
      const lat = p[1];
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
      sumLng += lng;
      sumLat += lat;
      count++;
    }
  };

  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach(processRing);
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((poly) => poly.forEach(processRing));
  }

  const bounds: LngLatBounds = [
    [minLng === Infinity ? 0 : minLng, minLat === Infinity ? 0 : minLat],
    [maxLng === -Infinity ? 0 : maxLng, maxLat === -Infinity ? 0 : maxLat],
  ];

  const center: LngLat =
    count > 0 ? [sumLng / count, sumLat / count] : [(minLng + maxLng) / 2, (minLat + maxLat) / 2];

  return { bounds, center };
}

// ---- 数据缓存 ----

let _chinaProvinces: AdminRegion[] | null = null;
let _worldCountries: AdminRegion[] | null = null;
let _globalCities: AdminRegion[] | null = null;
const _subdivisionCache = new Map<string, AdminRegion[]>();

const COUNTRY_ALIASES: Record<string, string> = {
  '中华人民共和国': '中国',
  '美利坚合众国': '美国',
  '俄罗斯联邦': '俄罗斯',
  '大不列颠及北爱尔兰联合王国': '英国',
  '法兰西共和国': '法国',
  '德意志联邦共和国': '德国',
  '日本国': '日本',
  '大韩民国': '韩国',
  '朝鲜民主主义人民共和国': '朝鲜',
  '澳大利亚联邦': '澳大利亚',
  '意大利共和国': '意大利',
};

/**
 * 获取中国省级行政区列表 (34 省区市)
 */
export function getChinaProvinces(): AdminRegion[] {
  if (_chinaProvinces) return _chinaProvinces;

  const fc = chinaProvincesData as unknown as FeatureCollection<Polygon | MultiPolygon>;
  _chinaProvinces = fc.features.map((f) => {
    const props = f.properties as {
      adcode: string;
      name: string;
      nameZh: string;
      nameEn: string;
      short?: string;
      capital?: string;
      center?: [number, number];
      level?: string;
    };

    const { bounds, center } = computeFeatureBounds(f.geometry);
    const regionCenter: LngLat = props.center ? [props.center[0], props.center[1]] : center;

    return {
      id: `prov-${props.adcode}`,
      name: props.name,
      nameZh: props.nameZh || props.name,
      nameEn: props.nameEn || props.name,
      level: (props.level as AdminLevel) || 'province',
      code: props.adcode,
      center: regionCenter,
      bounds,
      capital: props.capital,
      short: props.short,
      parentName: '中国',
      feature: f,
    };
  });

  return _chinaProvinces;
}

/**
 * 获取全球国家列表 (高清 50m)
 */
export function getWorldCountries(): AdminRegion[] {
  if (_worldCountries) return _worldCountries;

  const fc = countriesData as unknown as FeatureCollection<Polygon | MultiPolygon>;
  const list: AdminRegion[] = fc.features.flatMap((f) => {
    const props = f.properties as {
      NAME_EN?: string;
      NAME_ZH?: string;
      ADM0_A3?: string;
      ISO_N3?: string;
      CONTINENT?: string;
    };

    const name = props.NAME_EN?.trim() || '';
    if (!name) return [];
    const rawZh = props.NAME_ZH?.trim() || name;
    const nameZh = COUNTRY_ALIASES[rawZh] || rawZh;
    const code = props.ADM0_A3?.trim() || props.ISO_N3?.trim() || name;
    const { bounds, center } = computeFeatureBounds(f.geometry);

    return [
      {
        id: `country-${code}`,
        name,
        nameZh,
        nameEn: name,
        level: 'country' as AdminLevel,
        code,
        center,
        bounds,
        continent: props.CONTINENT?.trim() || '',
        feature: f,
      },
    ];
  });

  _worldCountries = list.sort((a, b) => a.nameZh.localeCompare(b.nameZh, 'zh-CN'));
  return _worldCountries;
}

/**
 * 获取国际重点城市/大都市区
 */
export function getGlobalMajorCities(): AdminRegion[] {
  if (_globalCities) return _globalCities;

  const fc = globalCitiesData as unknown as FeatureCollection<Polygon | MultiPolygon>;
  _globalCities = fc.features.map((f) => {
    const props = f.properties as {
      id: string;
      name: string;
      nameZh: string;
      nameEn: string;
      country: string;
      countryCode: string;
      center: [number, number];
      bounds: [[number, number], [number, number]];
    };

    return {
      id: props.id,
      name: props.nameZh,
      nameZh: props.nameZh,
      nameEn: props.nameEn,
      level: 'global-city',
      code: props.countryCode,
      center: props.center as LngLat,
      bounds: props.bounds as LngLatBounds,
      parentName: props.country,
      continent: 'Global',
      feature: f,
    };
  });

  return _globalCities;
}

/**
 * 动态拉取指定省/市的下级行政区划矢量 (市级 / 县级)
 * 具备内存缓存与离线兜底机制
 */
export async function fetchSubdivisions(adcode: string): Promise<AdminRegion[]> {
  if (!adcode) return [];
  if (_subdivisionCache.has(adcode)) {
    return _subdivisionCache.get(adcode)!;
  }

  try {
    const url = `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as FeatureCollection<Polygon | MultiPolygon>;

    const regions: AdminRegion[] = data.features
      .filter((f) => {
        const c = String(f.properties?.adcode || '');
        return c && c !== adcode && f.properties?.name;
      })
      .map((f) => {
        const props = f.properties as {
          adcode: string;
          name: string;
          level?: string;
          center?: [number, number];
        };
        const { bounds, center } = computeFeatureBounds(f.geometry);
        const regionCenter: LngLat = props.center ? [props.center[0], props.center[1]] : center;
        const level: AdminLevel =
          props.level === 'district' || props.level === 'county' ? 'county' : 'city';

        return {
          id: `sub-${props.adcode}`,
          name: props.name,
          nameZh: props.name,
          nameEn: props.name,
          level,
          code: String(props.adcode),
          center: regionCenter,
          bounds,
          parentCode: adcode,
          feature: f,
        };
      });

    _subdivisionCache.set(adcode, regions);
    return regions;
  } catch (err) {
    console.warn(`[admin-boundary] fetchSubdivisions failed for ${adcode}:`, err);
    return [];
  }
}

/**
 * 模糊检索全国省、市、县及国际大都市区
 * 返回匹配列表（带完整的父级行政归属路径）
 */
export function searchAdminRegions(query: string): AdminRegion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: AdminRegion[] = [];

  // 1. 国际主要城市
  for (const gc of getGlobalMajorCities()) {
    if (
      gc.name.toLowerCase().includes(q) ||
      gc.nameZh.toLowerCase().includes(q) ||
      gc.nameEn.toLowerCase().includes(q) ||
      (gc.parentName && gc.parentName.toLowerCase().includes(q))
    ) {
      results.push(gc);
    }
  }

  // 2. 中国省级
  for (const p of getChinaProvinces()) {
    if (
      p.name.toLowerCase().includes(q) ||
      p.nameZh.toLowerCase().includes(q) ||
      p.nameEn.toLowerCase().includes(q) ||
      (p.short && p.short.toLowerCase().includes(q)) ||
      (p.capital && p.capital.toLowerCase().includes(q))
    ) {
      results.push(p);
    }
  }

  // 3. 中国地级市与区县索引树 (500+ 地市与县级)
  const treeData = chinaAdminTreeData as unknown as {
    flatIndex: {
      adcode: string;
      name: string;
      level: string;
      center: [number, number];
      parentName?: string;
    }[];
  };

  for (const item of treeData.flatIndex) {
    if (item.level === 'province') continue; // 省级已在前一步加入
    if (
      item.name.toLowerCase().includes(q) ||
      (item.parentName && item.parentName.toLowerCase().includes(q))
    ) {
      // 构造近似 bounds（用于初次定位）
      const c = item.center;
      const delta = item.level === 'city' ? 0.4 : 0.15;
      const bounds: LngLatBounds = [
        [c[0] - delta, c[1] - delta],
        [c[0] + delta, c[1] + delta],
      ];

      results.push({
        id: `tree-${item.adcode}`,
        name: item.name,
        nameZh: item.name,
        nameEn: item.name,
        level: (item.level as AdminLevel) || 'city',
        code: item.adcode,
        center: item.center as LngLat,
        bounds,
        parentName: item.parentName,
      });
    }
  }

  // 4. 全球主权国家
  for (const c of getWorldCountries()) {
    if (
      c.name.toLowerCase().includes(q) ||
      c.nameZh.toLowerCase().includes(q) ||
      c.nameEn.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q)
    ) {
      results.push(c);
    }
  }

  return results.slice(0, 25);
}

/**
 * 根据层级开关与当前激活的下钻子层级生成复合 GeoJSON
 */
export function getCombinedBoundariesGeoJson(filter: BoundaryLayerFilter): FeatureCollection {
  const features: Feature[] = [];

  // 1. 全球国家边界
  if (filter.showCountries) {
    for (const c of getWorldCountries()) {
      if (!c.feature) continue;
      features.push({
        ...c.feature,
        id: c.id,
        properties: {
          id: c.id,
          name: c.nameZh,
          nameEn: c.nameEn,
          level: 'country',
          code: c.code,
          center: c.center,
        },
      });
    }
  }

  // 2. 中国省级边界 (若已下钻某省，排除该被下钻省的整面，以子级取代)
  if (filter.showProvinces) {
    // 提取所有活跃子区划对应的父级省份代码（前两位 + '0000'，以及直接记录的 parentCode）
    const drilledProvinceCodes = new Set<string>();
    for (const s of filter.activeSubdivisions || []) {
      if (s.parentCode) drilledProvinceCodes.add(s.parentCode);
      if (s.code && s.code.length >= 2) {
        drilledProvinceCodes.add(`${s.code.slice(0, 2)}0000`);
      }
    }

    for (const p of getChinaProvinces()) {
      if (!p.feature) continue;
      // 如果当前正在下钻这个省（包括地市或区县），不把该省整面塞入，避免遮挡地市或区县多边形
      if (drilledProvinceCodes.has(p.code)) continue;

      features.push({
        ...p.feature,
        id: p.id,
        properties: {
          id: p.id,
          name: p.nameZh,
          nameEn: p.nameEn,
          short: p.short,
          capital: p.capital,
          level: p.level,
          code: p.code,
          center: p.center,
        },
      });
    }
  }

  // 3. 国际主要大都市区
  if (filter.showGlobalCities) {
    for (const gc of getGlobalMajorCities()) {
      if (!gc.feature) continue;
      features.push({
        ...gc.feature,
        id: gc.id,
        properties: {
          id: gc.id,
          name: gc.nameZh,
          nameEn: gc.nameEn,
          parentName: gc.parentName,
          level: 'global-city',
          code: gc.code,
          center: gc.center,
        },
      });
    }
  }

  // 4. 当前下钻的市级或县级子级图层
  if (filter.activeSubdivisions && filter.activeSubdivisions.length > 0) {
    for (const sub of filter.activeSubdivisions) {
      const feat: Feature = sub.feature || {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: sub.center,
        },
        properties: {},
      };
      features.push({
        ...feat,
        id: sub.id,
        properties: {
          ...feat.properties,
          id: sub.id,
          name: sub.nameZh,
          nameEn: sub.nameEn,
          level: sub.level,
          code: sub.code,
          center: sub.center,
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
