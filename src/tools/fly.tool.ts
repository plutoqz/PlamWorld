// tools/fly.tool.ts — 3D 飞行漫游工具 (MapTool)
// 使用 MapLibre freeCamera API 做飞行巡航

import type { MapTool, ToolContext } from '../core/tools';
import type * as maplibregl from 'maplibre-gl';
import { enableTerrain3D, disableTerrain3D } from '../engines/maplibre/terrain';

export class FlyTool implements MapTool {
  readonly id = 'fly';
  readonly name = '3D 飞行';
  readonly icon = '✈️';
  readonly category = 'navigation';
  readonly description = '3D 自由飞行漫游，俯瞰地形';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private hadTerrain = false;
  private originalView: { pitch: number; bearing: number; zoom: number } | null = null;

  private onStateChange: (() => void) | null = null;

  get engine() { return this.ctx?.engine ?? null; }
  setOnStateChange(cb: (() => void) | null): void { this.onStateChange = cb; }

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
    const map = ctx.engine.getNative() as maplibregl.Map;
    this.hadTerrain = !!map.getTerrain();
    this.originalView = {
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      zoom: map.getZoom(),
    };
    enableTerrain3D(map, 1.35);
    map.easeTo({ pitch: 65, duration: 600 });
    this.onStateChange?.();
  }

  deactivate(): void {
    const map = this.ctx?.engine.getNative() as maplibregl.Map | undefined;
    if (map) {
      if (!this.hadTerrain) disableTerrain3D(map);
      if (this.originalView) {
        map.easeTo({ ...this.originalView, duration: 500 });
      }
    }
    this.active = false;
    this.ctx = null;
    this.originalView = null;
    this.onStateChange?.();
  }

  isActive(): boolean { return this.active; }
}
