// sources/osm-raster.ts — OSM 栅格瓦片（最简单可靠的图源）

import type { EngineKind } from '../core/types';
import type { ITileSource } from '../core/source';

/** 最简 OSM 栅格图源 — 不需要矢量字体、不依赖外部 sprite/glyph */
export const osmRaster: ITileSource = {
  id: 'osm-raster',
  name: 'OSM 导航',
  type: 'raster',
  category: 'navigation',
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
  minZoom: 0,
  maxZoom: 19,

  toEngineConfig(kind: EngineKind) {
    if (kind === 'maplibre') {
      return {
        version: 8,
        sources: {
          'osm-raster': {
            type: 'raster',
            tiles: [this.tileUrl],
            tileSize: 256,
            attribution: this.attribution,
          },
        },
        layers: [
          {
            id: 'osm-raster-layer',
            type: 'raster',
            source: 'osm-raster',
          },
        ],
      };
    }
    throw new Error(`OSM Raster: 不支持的引擎 ${kind}`);
  },
};
