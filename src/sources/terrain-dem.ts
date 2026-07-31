// sources/terrain-dem.ts — MapLibre Terrain3D DEM 瓦片源

import type { EngineKind } from '../core/types';
import type { ITileSource } from '../core/source';

/** MapLibre 公开 Terrain RGB DEM 源 — 用于 3D 地形渲染 */
export const terrainDem: ITileSource = {
  id: 'terrain-dem',
  name: 'Terrain RGB DEM',
  type: 'terrain',
  category: 'topo',
  tileUrl:
    'https://api.maptiler.com/tiles/terrain-rgb/tiles.json',
  attribution: 'MapTiler',
  minZoom: 0,
  maxZoom: 15,
  // 注意：此源仅在 MapLibre 中使用 Terrain3D 配置时生效，不走 toEngineConfig
  toEngineConfig(_kind: EngineKind) {
    throw new Error('DEM 源应通过 MapLibre Terrain3D API 配置，不走 setTileSource');
  },
};
