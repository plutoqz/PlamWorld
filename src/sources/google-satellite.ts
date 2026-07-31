// sources/google-satellite.ts — Google 卫星影像图源

import type { EngineKind } from '../core/types';
import type { ITileSource } from '../core/source';

export const googleSatellite: ITileSource = {
  id: 'google-satellite',
  name: '卫星影像',
  type: 'raster',
  category: 'satellite',
  tileUrl: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  attribution: 'Google Satellite',
  minZoom: 0,
  maxZoom: 20,

  toEngineConfig(kind: EngineKind) {
    if (kind === 'maplibre') {
      return {
        version: 8,
        sources: {
          'google-satellite': {
            type: 'raster',
            tiles: [this.tileUrl],
            tileSize: 256,
            attribution: this.attribution,
          },
        },
        layers: [
          {
            id: 'google-satellite-layer',
            type: 'raster',
            source: 'google-satellite',
          },
        ],
      };
    }
    throw new Error(`Google Satellite: 不支持的引擎 ${kind}`);
  },
};
