// sources/esri-satellite.ts — ESRI World Imagery 卫星图源

import type { EngineKind } from '../core/types';
import type { ITileSource } from '../core/source';

export const esriSatellite: ITileSource = {
  id: 'esri-satellite',
  name: 'ESRI 卫星影像',
  type: 'raster',
  category: 'satellite',
  tileUrl:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Esri, Maxar, Earthstar Geographics',
  minZoom: 0,
  maxZoom: 19,

  toEngineConfig(kind: EngineKind) {
    if (kind === 'maplibre') {
      return {
        version: 8,
        sources: {
          'esri-satellite': {
            type: 'raster',
            tiles: [this.tileUrl],
            tileSize: this.tileSize ?? 256,
            attribution: this.attribution,
            minzoom: this.minZoom,
            maxzoom: this.maxZoom,
          },
        },
        layers: [
          {
            id: 'esri-satellite-layer',
            type: 'raster',
            source: 'esri-satellite',
          },
        ],
      };
    }
    throw new Error(`ESRI Satellite: 不支持的引擎 ${kind}`);
  },
};
