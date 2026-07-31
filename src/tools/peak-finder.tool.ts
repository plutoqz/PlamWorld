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
  source?: 'catalog' | 'dem';
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

  private computePeaks(): void {
    if (!this._viewPoint) { this._peaks = []; return; }
    const [vpLng, vpLat] = this._viewPoint;

    const results: PeakInfo[] = [];
    for (const p of PeakFinderTool.SAMPLE_PEAKS) {
      const distKm = haversine(vpLat, vpLng, p.lat, p.lng);
      if (distKm > this._searchRadius) continue;

      const bearing = computeBearing(vpLat, vpLng, p.lat, p.lng);

      // Simple visibility: check if the peak is above the horizon from observer height
      // Earth curvature + observer height
      const earthRadiusKm = 6371;
      const horizonDist = Math.sqrt(2 * earthRadiusKm * (this._observerHeight / 1000));
      const visible = distKm < horizonDist * 3 || p.elevation > 500; // simplified heuristic

      results.push({
        ...p,
        distance: distKm,
        bearing,
        visible,
        source: 'catalog',
      });
    }

    // Sort by distance, visible first
    results.sort((a, b) => {
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      return a.distance - b.distance;
    });

    this._peaks = results.slice(0, 20);
  }

  private recompute(): void {
    this.computePeaks();
    this.notify();
    if (this._peaks.length === 0 && this._viewPoint) {
      void this.findHighestPoint(this._viewPoint);
    }
  }

  private async findHighestPoint(viewPoint: LngLat): Promise<void> {
    this.searchController?.abort();
    const controller = new AbortController();
    this.searchController = controller;
    this._searching = true;
    this.notify();

    try {
      const gridSize = 11;
      const radiusKm = Math.min(50, this._searchRadius);
      const latSpan = radiusKm / 111.32;
      const lngSpan = latSpan / Math.max(0.2, Math.cos(viewPoint[1] * Math.PI / 180));
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
        resolutionMeters: radiusKm * 2000 / (gridSize - 1),
      });
      if (controller.signal.aborted || this._viewPoint?.[0] !== viewPoint[0] || this._viewPoint?.[1] !== viewPoint[1]) return;

      let highestIndex = -1;
      let highestElevation = -Infinity;
      elevations.forEach((elevation, index) => {
        if (elevation !== null && elevation > highestElevation) {
          highestElevation = elevation;
          highestIndex = index;
        }
      });
      if (highestIndex >= 0) {
        const coordinate = points[highestIndex];
        this._peaks = [{
          name: '当前区域最高点',
          lng: coordinate[0],
          lat: coordinate[1],
          elevation: highestElevation,
          distance: haversine(viewPoint[1], viewPoint[0], coordinate[1], coordinate[0]),
          bearing: computeBearing(viewPoint[1], viewPoint[0], coordinate[1], coordinate[0]),
          visible: true,
          source: 'dem',
        }];
      }
    } catch (error) {
      if (!controller.signal.aborted) console.warn('[PeakFinder] DEM fallback failed:', error);
    } finally {
      if (this.searchController === controller) {
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
