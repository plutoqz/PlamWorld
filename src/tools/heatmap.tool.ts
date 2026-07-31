// tools/heatmap.tool.ts — 热力图工具 (MapTool)
//
// 数据源：
//   1. 地图点击手动采点
//   2. CSV 文件导入 (lng, lat, [weight])
// 渲染：MapLibre 原生 heatmap layer

import type { MapTool, ToolContext } from '../core/tools';

export interface HeatPoint {
  lng: number;
  lat: number;
  /** 可选权重 (1-100)，默认 50 */
  weight: number;
}

export class HeatmapTool implements MapTool {
  readonly id = 'heatmap';
  readonly name = '热力图';
  readonly icon = '🔥';
  readonly category = 'visualization';
  readonly description = '点击采点 / CSV导入 → KDE 热力图';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;

  points: HeatPoint[] = [];

  // 回调
  private onStateChange: (() => void) | null = null;

  get engine() { return this.ctx?.engine ?? null; }

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  addPoint(pt: HeatPoint): void {
    this.points.push(pt);
    this.onStateChange?.();
  }

  addPoints(pts: HeatPoint[]): void {
    this.points.push(...pts);
    this.onStateChange?.();
  }

  clearPoints(): void {
    this.points = [];
    this.onStateChange?.();
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
    this.points = [];
  }

  deactivate(): void {
    this.active = false;
    this.ctx = null;
    this.points = [];
  }

  isActive(): boolean {
    return this.active;
  }
}
