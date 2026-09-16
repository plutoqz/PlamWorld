// tools/time-travel.tool.ts — 时空穿梭工具 (MapTool)
// 对接官方 ESRI World Imagery Wayback 历史遥感档案 (2014 - 2026)

import type * as maplibregl from 'maplibre-gl';
import type { MapTool, ToolContext } from '../core/tools';

export interface WaybackRelease {
  year: number;
  releaseNum: string;
  date: string;
  label: string;
}

export const WAYBACK_RELEASES: WaybackRelease[] = [
  { year: 2014, releaseNum: '5844', date: '2014-12-30', label: '2014 年底' },
  { year: 2015, releaseNum: '28163', date: '2015-12-16', label: '2015 年底' },
  { year: 2016, releaseNum: '18966', date: '2016-12-20', label: '2016 年底' },
  { year: 2017, releaseNum: '25521', date: '2017-11-16', label: '2017 年底' },
  { year: 2018, releaseNum: '23448', date: '2018-12-14', label: '2018 年底' },
  { year: 2019, releaseNum: '4756', date: '2019-12-12', label: '2019 年底' },
  { year: 2020, releaseNum: '29260', date: '2020-12-16', label: '2020 年底' },
  { year: 2021, releaseNum: '26120', date: '2021-12-21', label: '2021 年底' },
  { year: 2022, releaseNum: '45134', date: '2022-12-14', label: '2022 年底' },
  { year: 2023, releaseNum: '56102', date: '2023-12-07', label: '2023 年底' },
  { year: 2024, releaseNum: '16453', date: '2024-12-12', label: '2024 年底' },
  { year: 2025, releaseNum: '13192', date: '2025-12-18', label: '2025 年底' },
  { year: 2026, releaseNum: '26334', date: '2026-08-05', label: '2026 最新' },
];

export function getWaybackTileUrl(releaseNum: string): string {
  return `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${releaseNum}/{z}/{y}/{x}`;
}

export class TimeTravelTool implements MapTool {
  readonly id = 'time-travel';
  readonly name = '时空穿梭';
  readonly icon = '⏳';
  readonly category = 'simulation';
  readonly description = 'ESRI Wayback 真实历史遥感卫星影像 (2014-2026)';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private timer: number | null = null;

  year = 2020;
  opacity = 1.0;
  isPlaying = false;

  private readonly SOURCE_ID = 'palm-wayback-imagery-src';
  private readonly LAYER_ID = 'palm-wayback-imagery-lyr';

  private onStateChange: (() => void) | null = null;

  get engine() {
    return this.ctx?.engine ?? null;
  }
  get releases() {
    return WAYBACK_RELEASES;
  }
  get currentRelease(): WaybackRelease {
    return (
      WAYBACK_RELEASES.find((r) => r.year === this.year) ??
      WAYBACK_RELEASES[WAYBACK_RELEASES.length - 1]!
    );
  }

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  private notify(): void {
    this.onStateChange?.();
  }

  setYear(y: number): void {
    this.year = Math.max(2014, Math.min(2026, y));
    this.applyLayer();
    this.notify();
  }

  setOpacity(op: number): void {
    this.opacity = Math.max(0, Math.min(1, op));
    const map = this.ctx?.engine.getNative() as maplibregl.Map | null;
    if (map && map.getLayer(this.LAYER_ID)) {
      map.setPaintProperty(this.LAYER_ID, 'raster-opacity', this.opacity);
    }
    this.notify();
  }

  setPlaying(p: boolean): void {
    this.isPlaying = p;
    if (p) {
      this.startTimelapse();
    } else {
      this.stopTimelapse();
    }
    this.notify();
  }

  private startTimelapse(): void {
    this.stopTimelapse();
    this.timer = window.setInterval(() => {
      let nextYear = this.year + 1;
      if (nextYear > 2026) nextYear = 2014;
      this.setYear(nextYear);
    }, 1500);
  }

  private stopTimelapse(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private applyLayer(): void {
    const map = this.ctx?.engine.getNative() as maplibregl.Map | null;
    if (!map) return;

    const rel = this.currentRelease;
    const tileUrl = getWaybackTileUrl(rel.releaseNum);

    // 移除旧图层与旧源以刷新瓦片
    try {
      if (map.getLayer(this.LAYER_ID)) map.removeLayer(this.LAYER_ID);
    } catch {
      /* 容错 */
    }
    try {
      if (map.getSource(this.SOURCE_ID)) map.removeSource(this.SOURCE_ID);
    } catch {
      /* 容错 */
    }

    map.addSource(this.SOURCE_ID, {
      type: 'raster',
      tiles: [tileUrl],
      tileSize: 256,
      maxzoom: 19,
    });

    map.addLayer({
      id: this.LAYER_ID,
      type: 'raster',
      source: this.SOURCE_ID,
      paint: {
        'raster-opacity': this.opacity,
        'raster-fade-duration': 300,
      },
    });
  }

  private removeLayer(): void {
    const map = this.ctx?.engine.getNative() as maplibregl.Map | null;
    if (!map) return;
    try {
      if (map.getLayer(this.LAYER_ID)) map.removeLayer(this.LAYER_ID);
    } catch {
      /* 容错 */
    }
    try {
      if (map.getSource(this.SOURCE_ID)) map.removeSource(this.SOURCE_ID);
    } catch {
      /* 容错 */
    }
  }

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
    this.applyLayer();
    this.notify();
  }

  deactivate(): void {
    this.setPlaying(false);
    this.removeLayer();
    this.active = false;
    this.ctx = null;
    this.notify();
  }

  isActive(): boolean {
    return this.active;
  }
}

