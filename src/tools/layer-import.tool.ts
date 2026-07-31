// tools/layer-import.tool.ts — 自定义图层导入工具 (MapTool)
//
// 支持 GeoJSON / GPX / KML 文件导入，渲染为 MapLibre GeoJSON 图层

import type { MapTool, ToolContext } from '../core/tools';
import type { FeatureCollection } from 'geojson';

export interface ImportedLayer {
  id: string;
  name: string;
  visible: boolean;
  data: FeatureCollection;
  color: string;
}

export class LayerImportTool implements MapTool {
  readonly id = 'layer-import';
  readonly name = '图层导入';
  readonly icon = '📂';
  readonly category = 'visualization';
  readonly description = '导入 GeoJSON/GPX/KML 文件，叠加到地图';
  readonly exclusive = false;

  private active = false;
  private ctx: ToolContext | null = null;

  layers: ImportedLayer[] = [];
  private idCounter = 0;

  private onStateChange: (() => void) | null = null;

  get engine() { return this.ctx?.engine ?? null; }

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  addLayer(name: string, data: FeatureCollection, color = '#4fc3f7'): ImportedLayer {
    const layer: ImportedLayer = {
      id: `import-${++this.idCounter}`,
      name,
      visible: true,
      data,
      color,
    };
    this.layers.push(layer);
    this.onStateChange?.();
    return layer;
  }

  removeLayer(id: string): void {
    this.layers = this.layers.filter((l) => l.id !== id);
    this.onStateChange?.();
  }

  toggleLayer(id: string): void {
    const layer = this.layers.find((l) => l.id === id);
    if (layer) { layer.visible = !layer.visible; this.onStateChange?.(); }
  }

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
  }

  deactivate(): void {
    this.active = false;
    this.ctx = null;
    this.layers = [];
  }

  isActive(): boolean { return this.active; }
}
