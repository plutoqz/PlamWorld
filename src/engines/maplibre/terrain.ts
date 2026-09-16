// engines/maplibre/terrain.ts — MapLibre 3D 地形配置 + DEM 管线
// DEM 源：MapLibre 官方 JAXA AW3D30 (TileJSON)，免费全球覆盖

import type * as maplibregl from 'maplibre-gl';

export const TERRAIN_SOURCE_ID = 'terrain-dem';

/** Mapzen Terrarium RGB DEM 瓦片 (AWS Open Data, 全球覆盖，免费，maxzoom=15) */
export const TERRARIUM_TILES = [
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
];

/**
 * 添加 DEM 地形源。
 * 使用 Mapzen Terrarium RGB 瓦片，MapLibre 原生支持 encoding: 'terrarium' 全球无缝覆盖。
 */
export function addTerrainSource(map: maplibregl.Map): void {
  if (map.getSource(TERRAIN_SOURCE_ID)) return;

  map.addSource(TERRAIN_SOURCE_ID, {
    type: 'raster-dem',
    encoding: 'terrarium',
    tiles: TERRARIUM_TILES,
    tileSize: 256,
    maxzoom: 15,
  });
}

export function enableTerrain3D(map: maplibregl.Map, exaggeration = 1.5): void {
  addTerrainSource(map);
  map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration });
}

export function disableTerrain3D(map: maplibregl.Map): void {
  map.setTerrain(null);
}

// ============================================================
//  DEM 管线
// ============================================================

/**
 * 轮询等待 DEM 数据就绪。
 * 每 500ms 轮询 map 中心点 queryTerrainElevation，
 * 直到返回有效值（> -500 且 != 0）或超时。
 *
 * 注意：要求 elevation != 0 是特意设计的——
 * 某些 buggy 源会始终返回 0，排除这种假就绪。
 */
export async function waitForTerrainData(
  map: maplibregl.Map,
  timeoutMs = 20_000,
): Promise<boolean> {
  const center = map.getCenter();
  const start = Date.now();
  let lastVal: number | null | undefined = undefined;

  while (Date.now() - start < timeoutMs) {
    const el = map.queryTerrainElevation({ lng: center.lng, lat: center.lat });
    lastVal = el;

    if (el != null && !isNaN(el) && el !== 0 && el > -500) {
      console.log(
        `[terrain] ✅ DEM 就绪 center=(${center.lng.toFixed(4)},${center.lat.toFixed(4)}) el=${el.toFixed(1)}m ${Date.now() - start}ms`,
      );
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.warn(
    `[terrain] ⚠️ DEM 超时 (${timeoutMs}ms) 最后查询值: ${lastVal}。` +
    `如果为 0 或 null，说明 terrain source 未返回有效高程。`,
  );
  return false;
}

/**
 * 确保 terrain 就绪。临时启用 → 轮询等待 → 返回 cleanup。
 */
export async function ensureTerrainReady(
  map: maplibregl.Map,
): Promise<[boolean, () => void]> {
  addTerrainSource(map);

  const hadTerrain = !!map.getTerrain();
  if (!hadTerrain) {
    map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1 });
  }

  const ok = await waitForTerrainData(map);

  const cleanup = () => {
    if (!hadTerrain) {
      map.setTerrain(null);
    }
  };

  return [ok, cleanup];
}
