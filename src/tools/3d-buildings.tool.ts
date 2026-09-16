// tools/3d-buildings.tool.ts — 3D 建筑真实挤出工具 (MapTool)
// 数据源：OpenFreeMap 全球矢量切片 (building 图层)

import type * as maplibregl from 'maplibre-gl';
import type { MapTool, ToolContext } from '../core/tools';
import {
  BuildingExtrusionOverlay,
  type BuildingTheme,
} from '../engines/maplibre/building-extrusion-overlay';

export class Buildings3DTool implements MapTool {
  readonly id = '3d-buildings';
  readonly name = '3D 建筑挤出';
  readonly icon = '🏗️';
  readonly category = 'visualization';
  readonly description = '全球矢量建筑 3D 真实挤出';
  readonly exclusive = false;

  private active = false;
  private ctx: ToolContext | null = null;
  private overlay: BuildingExtrusionOverlay | null = null;

  heightScale = 1.0;
  opacity = 0.85;
  theme: BuildingTheme = 'modern';

  private onStateChange: (() => void) | null = null;

  get engine() {
    return this.ctx?.engine ?? null;
  }

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  private notify(): void {
    this.onStateChange?.();
  }

  setHeightScale(scale: number): void {
    this.heightScale = scale;
    this.overlay?.setHeightScale(scale);
    this.notify();
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity;
    this.overlay?.setOpacity(opacity);
    this.notify();
  }

  setTheme(theme: BuildingTheme): void {
    this.theme = theme;
    this.overlay?.setTheme(theme);
    this.notify();
  }

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
    const map = ctx.engine.getNative() as maplibregl.Map;

    // 保留用户当前视口中心，仅平滑将视角倾斜至 55°（若缩放过小则适度拉近至 14.8）
    const currentPitch = map.getPitch();
    const currentZoom = map.getZoom();
    map.easeTo({
      pitch: Math.max(50, currentPitch),
      zoom: Math.max(14.8, currentZoom),
      duration: 800,
    });

    this.overlay = new BuildingExtrusionOverlay(map, {
      heightScale: this.heightScale,
      opacity: this.opacity,
      theme: this.theme,
    });
    this.notify();
  }

  deactivate(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.active = false;
    this.ctx = null;
    this.notify();
  }

  isActive(): boolean {
    return this.active;
  }
}

