// tools/viewshed.tool.ts — 通视分析工具 (MapTool)
//
// 交互：点击地图放置视点 → 拖动移动 → 滑块调观察者高度和半径

import type { MapTool, ToolContext } from '../core/tools';
import type { LngLat } from '../core/types';

export class ViewshedTool implements MapTool {
  readonly id = 'viewshed';
  readonly name = '通视分析';
  readonly icon = '👁️';
  readonly category = 'measurement';
  readonly description = '360° horizon line 通视计算，可见=绿/遮挡=红';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;

  /** 视点位置 (WGS84) */
  viewpoint: LngLat | null = null;
  /** 观察者离地高度 (m) */
  observerHeight = 2;
  /** 可视半径 (km) */
  radiusKm = 10;

  // 回调
  private onStateChange: (() => void) | null = null;

  // ---- public ----

  get engine() { return this.ctx?.engine ?? null; }

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  setViewpoint(pt: LngLat): void {
    this.viewpoint = pt;
    this.onStateChange?.();
  }

  setObserverHeight(h: number): void {
    this.observerHeight = Math.max(1, Math.min(300, h));
    this.onStateChange?.();
  }

  setRadiusKm(km: number): void {
    this.radiusKm = Math.max(1, Math.min(100, km));
    this.onStateChange?.();
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
    this.viewpoint = null;
  }

  deactivate(): void {
    this.active = false;
    this.ctx = null;
    this.viewpoint = null;
  }

  isActive(): boolean {
    return this.active;
  }
}
