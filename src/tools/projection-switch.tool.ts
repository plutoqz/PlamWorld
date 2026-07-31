// tools/projection-switch.tool.ts — 地图投影实时切换工具 (MapTool)
//
// 支持：Mercator / Orthographic (地球仪) / Equal Earth / Robinson
// 实现：独立 Canvas 覆盖层 + d3-geo 投影世界轮廓
//   Orthographic 模式隐藏 MapLibre，纯 Canvas 地球仪
//   其余投影保持 MapLibre 底图 + Canvas 叠加轮廓线

import type { MapTool, ToolContext } from '../core/tools';

export type ProjectionType = 'mercator' | 'orthographic' | 'equal-earth' | 'natural-earth';

export class ProjectionSwitchTool implements MapTool {
  readonly id = 'projection-switch';
  readonly name = '地图投影切换';
  readonly icon = '🌐';
  readonly category = 'simulation';
  readonly description = 'Mercator / 地球仪 / 等面积 / Robinson 实时切换';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private _projection: ProjectionType = 'mercator';
  private _rotation: [number, number, number] = [0, -30, 0]; // [lambda, phi, gamma] for globe
  private onStateChange: (() => void) | null = null;

  // ---- callbacks ----

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  notify(): void {
    this.onStateChange?.();
  }

  // ---- getters ----

  get projection(): ProjectionType { return this._projection; }
  get rotation(): [number, number, number] { return [...this._rotation]; }
  get engine() { return this.ctx?.engine ?? null; }

  // ---- setters ----

  setProjection(p: ProjectionType): void {
    this._projection = p;
    this.notify();
  }

  setRotation(r: [number, number, number]): void {
    this._rotation = r;
    this.notify();
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
  }

  deactivate(): void {
    this.active = false;
    this.ctx = null;
  }

  isActive(): boolean {
    return this.active;
  }
}
