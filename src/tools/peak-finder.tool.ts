// tools/peak-finder.tool.ts — 峰顶识别器工具 (MapTool)
//
// 用户点击视点 → 从内置山峰数据库筛选可见山峰 → 地图标签
// 复用 v0.3 通视算法简化版（horizon line 单方位角）

import type { MapTool, ToolContext } from '../core/tools';
import type { LngLat } from '../core/types';
import { queryElevations } from '../engines/elevation-api';

export interface PeakInfo {
  name: string;
  lat: number;
  lng: number;
  elevation: number; // m
  distance: number;   // km
  bearing: number;    // deg from view point
  visible: boolean;
  source?: 'catalog' | 'dem' | 'osm';
}

export class PeakFinderTool implements MapTool {
  readonly id = 'peak-finder';
  readonly name = '峰顶识别器';
  readonly icon = '⛰️';
  readonly category = 'measurement';
  readonly description = '点击视点 → 标注可见山峰';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private _viewPoint: LngLat | null = null;
  private _observerHeight = 2;   // m
  private _searchRadius = 100;    // km
  private _peaks: PeakInfo[] = [];
  private _searching = false;
  private searchController: AbortController | null = null;
  private onStateChange: (() => void) | null = null;

  // Built-in sample peaks (China + world famous, ~50 peaks)
  // Full OSM natural=peak download would be ~450K peaks, but we use a curated set
  private static SAMPLE_PEAKS: Omit<PeakInfo, 'distance' | 'bearing' | 'visible'>[] = [
    { name: '珠穆朗玛峰', lat: 27.9881, lng: 86.9250, elevation: 8848 },
    { name: 'K2 (乔戈里峰)', lat: 35.8825, lng: 76.5133, elevation: 8611 },
    { name: '干城章嘉峰', lat: 27.7025, lng: 88.1475, elevation: 8586 },
    { name: '洛子峰', lat: 27.9617, lng: 86.9331, elevation: 8516 },
    { name: '马卡鲁峰', lat: 27.8897, lng: 87.0889, elevation: 8485 },
    { name: '卓奥友峰', lat: 28.0942, lng: 86.6608, elevation: 8201 },
    { name: '道拉吉里峰', lat: 28.6983, lng: 83.4875, elevation: 8167 },
    { name: '马纳斯卢峰', lat: 28.5497, lng: 84.5597, elevation: 8163 },
    { name: '南迦帕尔巴特峰', lat: 35.2375, lng: 74.5892, elevation: 8126 },
    { name: '安纳普尔纳峰', lat: 28.5961, lng: 83.8203, elevation: 8091 },
    { name: '贡嘎山', lat: 29.5958, lng: 101.8792, elevation: 7556 },
    { name: '慕士塔格峰', lat: 38.2758, lng: 75.1131, elevation: 7546 },
    { name: '公格尔峰', lat: 38.5933, lng: 75.3153, elevation: 7649 },
    { name: '勃朗峰', lat: 45.8325, lng: 6.8644, elevation: 4808 },
    { name: '马特洪峰', lat: 45.9764, lng: 7.6583, elevation: 4478 },
    { name: '富士山', lat: 35.3606, lng: 138.7274, elevation: 3776 },
    { name: '乞力马扎罗山', lat: -3.0674, lng: 37.3556, elevation: 5895 },
    { name: '阿空加瓜山', lat: -32.6531, lng: -70.0117, elevation: 6961 },
    { name: '麦金利山', lat: 63.0692, lng: -151.0070, elevation: 6190 },
    { name: '厄尔布鲁士山', lat: 43.3550, lng: 42.4392, elevation: 5642 },
    { name: '文森峰', lat: -78.5252, lng: -85.6171, elevation: 4892 },
    { name: '查亚峰', lat: -4.0789, lng: 137.1583, elevation: 4884 },
    { name: '玉山', lat: 23.4700, lng: 120.9573, elevation: 3952 },
    { name: '峨眉山', lat: 29.5250, lng: 103.3325, elevation: 3099 },
    { name: '黄山', lat: 30.1250, lng: 118.1667, elevation: 1864 },
    { name: '泰山', lat: 36.2564, lng: 117.1058, elevation: 1545 },
    { name: '华山', lat: 34.4814, lng: 110.0889, elevation: 2154 },
    { name: '衡山', lat: 27.2550, lng: 112.7217, elevation: 1300 },
    { name: '恒山', lat: 39.6728, lng: 113.7367, elevation: 2017 },
    { name: '嵩山', lat: 34.4847, lng: 112.9547, elevation: 1512 },
  ];

  // ---- callbacks ----

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  notify(): void {
    this.onStateChange?.();
  }

  // ---- getters ----

  get viewPoint(): LngLat | null { return this._viewPoint ? [...this._viewPoint] as LngLat : null; }
  get observerHeight(): number { return this._observerHeight; }
  get searchRadius(): number { return this._searchRadius; }
  get peaks(): PeakInfo[] { return this._peaks; }
  get searching(): boolean { return this._searching; }
  get engine() { return this.ctx?.engine ?? null; }

  // ---- setters ----

  setViewPoint(pt: LngLat | null): void {
    this.searchController?.abort();
    this._viewPoint = pt ? [...pt] as LngLat : null;
    if (pt) this.recompute();
    this.notify();
  }

  setObserverHeight(h: number): void {
    this._observerHeight = h;
    if (this._viewPoint) this.recompute();
    this.notify();
  }

  setSearchRadius(km: number): void {
    this._searchRadius = km;
    if (this._viewPoint) this.recompute();
    this.notify();
  }

  // ---- core: compute visible peaks ----

  private recompute(): void {
    if (!this._viewPoint) {
      this._peaks = [];
      this.notify();
      return;
    }
    void this.searchPeaks(this._viewPoint);
  }

  private async searchPeaks(viewPoint: LngLat): Promise<void> {
    this.searchController?.abort();
    const controller = new AbortController();
    this.searchController = controller;
    this._searching = true;
    this.notify();

    const [vpLng, vpLat] = viewPoint;
    const radiusM = Math.min(100, Math.max(5, this._searchRadius)) * 1000;

    try {
      // 1. 获取观察点地表高程 (用于精确计算视线地平线距离)
      let observerGroundEle = 0;
      try {
        const obsEles = await queryElevations([viewPoint], {
          signal: controller.signal,
          resolutionMeters: 90,
        });
        if (obsEles && obsEles[0] !== null && Number.isFinite(obsEles[0])) {
          observerGroundEle = Math.max(0, obsEles[0]);
        }
      } catch {
        // 容错：使用 0m
      }
      if (controller.signal.aborted) return;

      const totalObsHeight = observerGroundEle + Math.max(1, this._observerHeight);

      // 2. 尝试从 Overpass API 获取真实自然山峰
      let osmPeaks: PeakInfo[] = [];
      const overpassEndpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
      ];

      const query = `[out:json][timeout:10];node(around:${radiusM},${vpLat},${vpLng})["natural"="peak"];out body 50;`;

      for (const endpoint of overpassEndpoints) {
        if (controller.signal.aborted) return;
        try {
          const resp = await fetch(endpoint, {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query),
            headers: {
              'User-Agent': 'PalmWorld-WebMap/0.6 (https://github.com/plutoqz/PalmWorld)',
            },
            signal: AbortSignal.timeout(9000),
          });

          if (!resp.ok) continue;
          const data = await resp.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const elements: any[] = data.elements ?? [];
          if (elements.length === 0) continue;

          // 提取包含名称或高程的节点
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const namedElements = elements.filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (e: any) =>
              e.tags && (e.tags.name || e.tags['name:zh'] || e.tags['name:en'] || e.tags.ele),
          );
          if (namedElements.length === 0) continue;

          // 需要通过 DEM 补齐高程的节点
          const needEleCoords: { idx: number; coord: LngLat }[] = [];
          const rawPeakList: {
            name: string;
            lat: number;
            lng: number;
            ele: number | null;
          }[] = [];

          namedElements.slice(0, 35).forEach((e, idx) => {
            const name =
              e.tags.name ||
              e.tags['name:zh'] ||
              e.tags['name:en'] ||
              (e.tags.ele ? `${e.tags.ele}m 山峰` : '未命名峰');
            const ele = e.tags.ele ? parseFloat(e.tags.ele) : null;
            rawPeakList.push({
              name,
              lat: e.lat,
              lng: e.lon,
              ele: Number.isFinite(ele) ? ele : null,
            });
            if (ele === null || !Number.isFinite(ele)) {
              needEleCoords.push({ idx, coord: [e.lon, e.lat] });
            }
          });

          // 批量查询缺失的高程
          if (needEleCoords.length > 0) {
            try {
              const queriedEles = await queryElevations(
                needEleCoords.map((c) => c.coord),
                { signal: controller.signal, resolutionMeters: 90 },
              );
              needEleCoords.forEach((item, qIdx) => {
                const eleVal = queriedEles[qIdx];
                if (eleVal !== null && Number.isFinite(eleVal)) {
                  rawPeakList[item.idx]!.ele = Math.round(eleVal);
                } else {
                  rawPeakList[item.idx]!.ele = 300;
                }
              });
            } catch {
              needEleCoords.forEach((item) => {
                rawPeakList[item.idx]!.ele = 300;
              });
            }
          }

          if (controller.signal.aborted) return;

          // 计算距离、方位角与可见性
          osmPeaks = rawPeakList.map((p) => {
            const distKm = haversine(vpLat, vpLng, p.lat, p.lng);
            const bearing = computeBearing(vpLat, vpLng, p.lat, p.lng);
            const ele = p.ele ?? 300;

            // 地球曲率视距公式 (km): 3.86 * (sqrt(h1) + sqrt(h2))
            const maxSightDistKm =
              3.86 * (Math.sqrt(totalObsHeight) + Math.sqrt(Math.max(0, ele)));
            const visible = distKm <= maxSightDistKm;

            return {
              name: p.name,
              lat: p.lat,
              lng: p.lng,
              elevation: ele,
              distance: distKm,
              bearing,
              visible,
              source: 'osm' as const,
            };
          });

          if (osmPeaks.length > 0) break;
        } catch {
          // 尝试下一个端点
        }
      }

      if (controller.signal.aborted) return;

      if (osmPeaks.length > 0) {
        // 排序：可见山峰优先，其次按距离由近及远
        osmPeaks.sort((a, b) => {
          if (a.visible !== b.visible) return a.visible ? -1 : 1;
          return a.distance - b.distance;
        });
        this._peaks = osmPeaks.slice(0, 25);
        return;
      }

      // 3. Overpass 无结果或离线：回退到内置名山库
      const catalogResults: PeakInfo[] = [];
      for (const p of PeakFinderTool.SAMPLE_PEAKS) {
        const distKm = haversine(vpLat, vpLng, p.lat, p.lng);
        if (distKm > this._searchRadius) continue;

        const bearing = computeBearing(vpLat, vpLng, p.lat, p.lng);
        const maxSightDistKm =
          3.86 * (Math.sqrt(totalObsHeight) + Math.sqrt(Math.max(0, p.elevation)));
        const visible = distKm <= maxSightDistKm;

        catalogResults.push({
          ...p,
          distance: distKm,
          bearing,
          visible,
          source: 'catalog',
        });
      }

      if (catalogResults.length > 0) {
        catalogResults.sort((a, b) => {
          if (a.visible !== b.visible) return a.visible ? -1 : 1;
          return a.distance - b.distance;
        });
        this._peaks = catalogResults.slice(0, 20);
        return;
      }

      // 4. 内置名山库仍无匹配：回退到 DEM 网格搜索区域最高峰
      await this.findHighestPoint(viewPoint, controller);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.warn('[PeakFinder] 搜索异常:', err);
      }
    } finally {
      if (this.searchController === controller) {
        this.searchController = null;
        this._searching = false;
        this.notify();
      }
    }
  }

  private async findHighestPoint(
    viewPoint: LngLat,
    existingController?: AbortController,
  ): Promise<void> {
    const controller = existingController ?? new AbortController();
    if (!existingController) {
      this.searchController?.abort();
      this.searchController = controller;
      this._searching = true;
      this.notify();
    }

    try {
      const gridSize = 11;
      const radiusKm = Math.min(50, this._searchRadius);
      const latSpan = radiusKm / 111.32;
      const lngSpan = latSpan / Math.max(0.2, Math.cos((viewPoint[1] * Math.PI) / 180));
      const points: LngLat[] = [];
      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          points.push([
            viewPoint[0] - lngSpan + (2 * lngSpan * col) / (gridSize - 1),
            viewPoint[1] + latSpan - (2 * latSpan * row) / (gridSize - 1),
          ]);
        }
      }

      const elevations = await queryElevations(points, {
        signal: controller.signal,
        resolutionMeters: (radiusKm * 2000) / (gridSize - 1),
      });
      if (
        controller.signal.aborted ||
        this._viewPoint?.[0] !== viewPoint[0] ||
        this._viewPoint?.[1] !== viewPoint[1]
      )
        return;

      let highestIndex = -1;
      let highestElevation = -Infinity;
      elevations.forEach((elevation, index) => {
        if (elevation !== null && elevation > highestElevation) {
          highestElevation = elevation;
          highestIndex = index;
        }
      });
      if (highestIndex >= 0) {
        const coordinate = points[highestIndex]!;
        this._peaks = [
          {
            name: '当前区域最高点',
            lng: coordinate[0],
            lat: coordinate[1],
            elevation: highestElevation,
            distance: haversine(viewPoint[1], viewPoint[0], coordinate[1], coordinate[0]),
            bearing: computeBearing(viewPoint[1], viewPoint[0], coordinate[1], coordinate[0]),
            visible: true,
            source: 'dem',
          },
        ];
      }
    } catch (error) {
      if (!controller.signal.aborted) console.warn('[PeakFinder] DEM fallback failed:', error);
    } finally {
      if (!existingController && this.searchController === controller) {
        this.searchController = null;
        this._searching = false;
        this.notify();
      }
    }
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
  }

  deactivate(): void {
    this.searchController?.abort();
    this.searchController = null;
    this._searching = false;
    this.active = false;
    this.ctx = null;
    this._viewPoint = null;
    this._peaks = [];
  }

  isActive(): boolean {
    return this.active;
  }
}

// ---- utils ----

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLng);
  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}
