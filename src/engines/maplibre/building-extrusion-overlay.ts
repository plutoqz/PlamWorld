// engines/maplibre/building-extrusion-overlay.ts — 原生 MapLibre 3D 建筑挤出图层
// 数据源：OpenFreeMap 全球矢量切片 (building 图层，含 render_height / render_min_height)

import type * as maplibregl from 'maplibre-gl';

export type BuildingTheme = 'modern' | 'cyberpunk' | 'white';

export interface BuildingOverlayOptions {
  heightScale?: number;
  opacity?: number;
  theme?: BuildingTheme;
}

const THEME_COLORS: Record<BuildingTheme, unknown> = {
  modern: [
    'interpolate',
    ['linear'],
    ['get', 'render_height'],
    0,
    '#94a3b8',
    30,
    '#64748b',
    70,
    '#475569',
    120,
    '#3b82f6',
    200,
    '#2563eb',
    300,
    '#4f46e5',
  ],
  cyberpunk: [
    'interpolate',
    ['linear'],
    ['get', 'render_height'],
    0,
    '#06b6d4',
    40,
    '#3b82f6',
    90,
    '#8b5cf6',
    150,
    '#ec4899',
    250,
    '#f43f5e',
  ],
  white: [
    'interpolate',
    ['linear'],
    ['get', 'render_height'],
    0,
    '#f1f5f9',
    50,
    '#e2e8f0',
    150,
    '#cbd5e1',
    300,
    '#94a3b8',
  ],
};

export class BuildingExtrusionOverlay {
  private map: maplibregl.Map;
  private readonly SOURCE_ID = 'openfreemap-buildings-src';
  private readonly LAYER_ID = 'openfreemap-buildings-lyr';

  private heightScale = 1.0;
  private opacity = 0.85;
  private theme: BuildingTheme = 'modern';

  constructor(map: maplibregl.Map, options?: BuildingOverlayOptions) {
    this.map = map;
    if (options?.heightScale !== undefined) this.heightScale = options.heightScale;
    if (options?.opacity !== undefined) this.opacity = options.opacity;
    if (options?.theme !== undefined) this.theme = options.theme;

    this.initLayer();
  }

  private initLayer(): void {
    if (!this.map.getSource(this.SOURCE_ID)) {
      this.map.addSource(this.SOURCE_ID, {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
      });
    }

    if (!this.map.getLayer(this.LAYER_ID)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.map.addLayer({
        id: this.LAYER_ID,
        source: this.SOURCE_ID,
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': THEME_COLORS[this.theme] as any,
          'fill-extrusion-height': [
            '*',
            this.heightScale,
            [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              14.5,
              [
                'coalesce',
                ['get', 'render_height'],
                ['*', ['coalesce', ['get', 'building:levels'], 1], 3.2],
                8,
              ],
            ],
          ] as any,
          'fill-extrusion-base': [
            '*',
            this.heightScale,
            ['coalesce', ['get', 'render_min_height'], 0],
          ] as any,
          'fill-extrusion-opacity': this.opacity,
        },
      });
    }
  }

  setHeightScale(scale: number): void {
    this.heightScale = scale;
    if (this.map.getLayer(this.LAYER_ID)) {
      this.map.setPaintProperty(this.LAYER_ID, 'fill-extrusion-height', [
        '*',
        this.heightScale,
        [
          'interpolate',
          ['linear'],
          ['zoom'],
          14,
          0,
          14.5,
          [
            'coalesce',
            ['get', 'render_height'],
            ['*', ['coalesce', ['get', 'building:levels'], 1], 3.2],
            8,
          ],
        ],
      ]);
      this.map.setPaintProperty(this.LAYER_ID, 'fill-extrusion-base', [
        '*',
        this.heightScale,
        ['coalesce', ['get', 'render_min_height'], 0],
      ]);
    }
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity;
    if (this.map.getLayer(this.LAYER_ID)) {
      this.map.setPaintProperty(this.LAYER_ID, 'fill-extrusion-opacity', opacity);
    }
  }

  setTheme(theme: BuildingTheme): void {
    this.theme = theme;
    if (this.map.getLayer(this.LAYER_ID)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.map.setPaintProperty(this.LAYER_ID, 'fill-extrusion-color', THEME_COLORS[theme] as any);
    }
  }

  remove(): void {
    try {
      if (this.map.getLayer(this.LAYER_ID)) {
        this.map.removeLayer(this.LAYER_ID);
      }
    } catch {
      // 容错
    }
    try {
      if (this.map.getSource(this.SOURCE_ID)) {
        this.map.removeSource(this.SOURCE_ID);
      }
    } catch {
      // 容错
    }
  }
}
