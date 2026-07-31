// sources/open-topo.ts — OpenTopoMap 地形图源

import type { EngineKind } from '../core/types';
import type { ITileSource } from '../core/source';

export const openTopo: ITileSource = {
  id: 'open-topo',
  name: '地形图',
  type: 'raster',
  category: 'topo',
  tileUrl: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
  attribution: 'OpenTopoMap (CC-BY-SA)',
  minZoom: 0,
  maxZoom: 17,

  toEngineConfig(kind: EngineKind) {
    if (kind === 'maplibre') {
      return {
        version: 8,
        sources: {
          'open-topo': {
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
            id: 'open-topo-layer',
            type: 'raster',
            source: 'open-topo',
          },
        ],
      };
    }
    throw new Error(`OpenTopoMap: 不支持的引擎 ${kind}`);
  },
};
