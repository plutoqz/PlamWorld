// tools/time-travel.tool.ts — 时空穿梭工具 (MapTool)
// 多年代卫星影像对比，通过年份滑块切换历史图源

import type { MapTool, ToolContext } from '../core/tools';

const TIMELINE_SOURCES = [
  { year: 2024, id: 'google-satellite', name: 'Google 卫星 (2024)' },
  { year: 2020, id: 'esri-satellite', name: 'ESRI 卫星 (2020)' },
  { year: 2015, id: 'osm-raster', name: 'OSM 导航 (参考)' },
];

export class TimeTravelTool implements MapTool {
  readonly id = 'time-travel';
  readonly name = '时空穿梭';
  readonly icon = '⏳';
  readonly category = 'simulation';
  readonly description = '多年份卫星影像对比，拖动年份滑块';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  year = 2024;

  private onStateChange: (() => void) | null = null;

  get engine() { return this.ctx?.engine ?? null; }
  get sources() { return TIMELINE_SOURCES; }

  setOnStateChange(cb: (() => void) | null): void { this.onStateChange = cb; }
  setYear(y: number): void { this.year = y; this.onStateChange?.(); }

  activate(ctx: ToolContext): void { this.active = true; this.ctx = ctx; }
  deactivate(): void { this.active = false; this.ctx = null; }
  isActive(): boolean { return this.active; }
}
