// sources/terrain-dem.ts — MapLibre Terrain3D DEM 瓦片源

import type { EngineKind } from '../core/types';
import type { ITileSource } from '../core/source';

/** Mapzen Terrarium DEM 源 — 用于 MapLibre Terrain3D 地形渲染 */
export const terrainDem: ITileSource = {
  id: 'terrain-dem',
  name: 'Terrarium DEM',
  type: 'terrain',
  category: 'topo',
  tileUrl: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  attribution: 'Mapzen Terrarium / AWS Open Data',
  minZoom: 0,
  maxZoom: 15,
  // 注意：此源仅在 MapLibre 中使用 Terrain3D 配置时生效，不走 toEngineConfig
  toEngineConfig(_kind: EngineKind) {
    throw new Error('DEM 源应通过 MapLibre Terrain3D API 配置，不走 setTileSource');
  },
};
