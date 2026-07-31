// tools/3d-buildings.tool.ts — 静态建筑挤出覆盖层

import * as maplibregl from 'maplibre-gl';
import type { MapTool, ToolContext } from '../core/tools';
import { BuildingExtrusionOverlay } from '../engines/maplibre/building-extrusion-overlay';
import { PMTILES_GEOJSON } from '../sources/pmtiles';

export class Buildings3DTool implements MapTool {
  readonly id = '3d-buildings';
  readonly name = '3D 建筑挤出';
  readonly icon = '🏗️';
  readonly category = 'visualization';
  readonly description = 'OSM 建筑足迹 3D 挤出渲染';
  readonly exclusive = false;

  private active = false;
  private overlay: BuildingExtrusionOverlay | null = null;

  activate(ctx: ToolContext): void {
    this.active = true;
    const map = ctx.engine.getNative() as maplibregl.Map;
    map.easeTo({ center: [11.255, 43.767], zoom: 14.5, pitch: 60, bearing: -18, duration: 700 });
    this.overlay = new BuildingExtrusionOverlay(map, PMTILES_GEOJSON);
  }

  deactivate(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }
}
