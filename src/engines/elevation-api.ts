import type { LngLat } from '../core/types';

const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const TILE_SIZE = 256;
const MAX_CACHE_TILES = 96;
const MAX_PARALLEL_REQUESTS = 6;
const MIN_ZOOM = 6;
const MAX_ZOOM = 13;

interface TerrainTile {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}

interface TilePoint {
  index: number;
  pixelX: number;
  pixelY: number;
}

interface TileGroup {
  z: number;
  x: number;
  y: number;
  points: TilePoint[];
}

export interface ElevationQueryOptions {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
  /** Approximate spacing between samples, used to avoid downloading excessive tiles. */
  resolutionMeters?: number;
}

const tileCache = new Map<string, Promise<TerrainTile>>();

/**
 * Read elevations from public Terrarium PNG tiles. Tiles are grouped and cached
 * across tools, so a dense grid does not translate into hundreds of API calls.
 */
export async function queryElevations(
  points: readonly LngLat[],
  options: ElevationQueryOptions = {},
): Promise<Array<number | null>> {
  if (points.length === 0) return [];
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const zoom = chooseTerrainZoom(points, options.resolutionMeters);
  const groups = groupPointsByTile(points, zoom);
  const result: Array<number | null> = Array.from({ length: points.length }, () => null);
  let completed = 0;

  for (let offset = 0; offset < groups.length; offset += MAX_PARALLEL_REQUESTS) {
    const batch = groups.slice(offset, offset + MAX_PARALLEL_REQUESTS);
    await Promise.all(batch.map(async (group) => {
      const tile = await loadTerrainTile(group.z, group.x, group.y, options.signal);
      for (const point of group.points) {
        const x = Math.min(tile.width - 1, point.pixelX);
        const y = Math.min(tile.height - 1, point.pixelY);
        const pixelOffset = (y * tile.width + x) * 4;
        const alpha = tile.pixels[pixelOffset + 3];
        result[point.index] = alpha === 0
          ? null
          : decodeTerrariumRgb(
            tile.pixels[pixelOffset],
            tile.pixels[pixelOffset + 1],
            tile.pixels[pixelOffset + 2],
          );
      }
      completed += group.points.length;
      options.onProgress?.(completed, points.length);
    }));
  }

  return result;
}

export function decodeTerrariumRgb(red: number, green: number, blue: number): number {
  return red * 256 + green + blue / 256 - 32768;
}

export function chooseTerrainZoom(
  points: readonly LngLat[],
  resolutionMeters?: number,
): number {
  const averageLatitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const spacing = resolutionMeters && resolutionMeters > 0
    ? resolutionMeters
    : estimateSampleSpacing(points);
  const targetPixelMeters = Math.max(30, spacing / 2);
  const metersPerPixelAtZoom0 = 156543.03392 * Math.cos(averageLatitude * Math.PI / 180);
  const zoom = Math.ceil(Math.log2(metersPerPixelAtZoom0 / targetPixelMeters));
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function estimateSampleSpacing(points: readonly LngLat[]): number {
  if (points.length < 2) return 100;
  const sampleCount = Math.min(points.length - 1, 32);
  const stride = Math.max(1, Math.floor((points.length - 1) / sampleCount));
  const distances: number[] = [];
  for (let index = stride; index < points.length; index += stride) {
    distances.push(approximateDistance(points[index - stride], points[index]));
  }
  distances.sort((a, b) => a - b);
  return distances[Math.floor(distances.length / 2)] || 100;
}

function approximateDistance(a: LngLat, b: LngLat): number {
  const centerLat = (a[1] + b[1]) / 2 * Math.PI / 180;
  const dx = (b[0] - a[0]) * 111320 * Math.cos(centerLat);
  const dy = (b[1] - a[1]) * 111320;
  return Math.hypot(dx, dy);
}

function groupPointsByTile(points: readonly LngLat[], zoom: number): TileGroup[] {
  const groups = new Map<string, TileGroup>();
  points.forEach((point, index) => {
    const tilePoint = lngLatToTilePixel(point, zoom);
    const key = `${zoom}/${tilePoint.x}/${tilePoint.y}`;
    let group = groups.get(key);
    if (!group) {
      group = { z: zoom, x: tilePoint.x, y: tilePoint.y, points: [] };
      groups.set(key, group);
    }
    group.points.push({ index, pixelX: tilePoint.pixelX, pixelY: tilePoint.pixelY });
  });
  return Array.from(groups.values());
}

function lngLatToTilePixel(point: LngLat, zoom: number) {
  const scale = 2 ** zoom;
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, point[1]));
  const worldX = ((point[0] + 180) / 360) * scale;
  const latitudeRad = latitude * Math.PI / 180;
  const worldY = (
    1 - Math.log(Math.tan(latitudeRad) + 1 / Math.cos(latitudeRad)) / Math.PI
  ) / 2 * scale;
  const rawX = Math.floor(worldX);
  const x = ((rawX % scale) + scale) % scale;
  const y = Math.max(0, Math.min(scale - 1, Math.floor(worldY)));
  return {
    x,
    y,
    pixelX: Math.max(0, Math.min(TILE_SIZE - 1, Math.floor((worldX - rawX) * TILE_SIZE))),
    pixelY: Math.max(0, Math.min(TILE_SIZE - 1, Math.floor((worldY - Math.floor(worldY)) * TILE_SIZE))),
  };
}

function loadTerrainTile(
  zoom: number,
  x: number,
  y: number,
  signal?: AbortSignal,
): Promise<TerrainTile> {
  const key = `${zoom}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) {
    touchCacheEntry(key, cached);
    return cached;
  }

  const request = fetchAndDecodeTile(zoom, x, y, signal).catch((error) => {
    tileCache.delete(key);
    throw error;
  });
  tileCache.set(key, request);
  trimTileCache();
  return request;
}

async function fetchAndDecodeTile(
  zoom: number,
  x: number,
  y: number,
  signal?: AbortSignal,
): Promise<TerrainTile> {
  const response = await fetch(`${TERRARIUM_URL}/${zoom}/${x}/${y}.png`, { signal });
  if (!response.ok) throw new Error(`DEM 瓦片加载失败 (${response.status})`);

  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('浏览器无法解码 DEM 瓦片');
    context.drawImage(bitmap, 0, 0);
    return {
      pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}

function touchCacheEntry(key: string, value: Promise<TerrainTile>): void {
  tileCache.delete(key);
  tileCache.set(key, value);
}

function trimTileCache(): void {
  while (tileCache.size > MAX_CACHE_TILES) {
    const oldestKey = tileCache.keys().next().value as string | undefined;
    if (!oldestKey) return;
    tileCache.delete(oldestKey);
  }
}

export function clearElevationCache(): void {
  tileCache.clear();
}
