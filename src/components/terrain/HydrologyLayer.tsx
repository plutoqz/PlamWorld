// components/terrain/HydrologyLayer.tsx — 水文分析结果可视化图层 v0.5
//
// 使用 MapLibre ImageSource 渲染流量累积热力图 / TWI / 流域掩码

import { useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';

const SOURCE_ID = 'palm-hydrology-src';
const LAYER_ID = 'palm-hydrology-layer';
const WATERSHED_SRC = 'palm-watershed-src';
const WATERSHED_LINE_ID = 'palm-watershed-line';
const WATERSHED_FILL_ID = 'palm-watershed-fill';

export type HydrologyVisMode = 'flow-accumulation' | 'watershed' | 'twi';

interface RenderParams {
  /** 各模式共享的格网参数 */
  cols: number;
  rows: number;
  bounds: { west: number; south: number; east: number; north: number };
  /** 流量累积（flow-accumulation 模式） */
  flowAcc?: number[] | Float32Array;
  /** TWI 数据 */
  twi?: number[] | Float32Array;
  /** 流域掩码 */
  watershed?: number[] | Uint8Array;
}

// ---- 渲染工具 ----

/** 流量累积 → log-scaled 色阶 heatmap ImageData */
function renderFlowAccumulationImage(
  flowAcc: number[] | Float32Array,
  cols: number,
  rows: number,
): ImageData {
  const arr = flowAcc instanceof Float32Array ? flowAcc : new Float32Array(flowAcc);
  // log scale
  const logArr = new Float32Array(arr.length);
  let maxLog = 0;
  for (let i = 0; i < arr.length; i++) {
    const val = Math.log1p(arr[i]);
    logArr[i] = val;
    if (val > maxLog) maxLog = val;
  }

  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(cols, rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const px = (rows - 1 - r) * cols + c; // flip Y
      const t = maxLog > 0 ? logArr[i] / maxLog : 0;
      const baseIdx = px * 4;

      if (arr[i] <= 1) {
        // No accumulation: transparent
        imgData.data[baseIdx] = 0;
        imgData.data[baseIdx + 1] = 0;
        imgData.data[baseIdx + 2] = 0;
        imgData.data[baseIdx + 3] = 0;
      } else {
        // Blue → Cyan → White heatmap
        const [r2, g2, b2] = flowAccColor(t);
        imgData.data[baseIdx] = r2;
        imgData.data[baseIdx + 1] = g2;
        imgData.data[baseIdx + 2] = b2;
        imgData.data[baseIdx + 3] = Math.round(180 + 75 * t);
      }
    }
  }

  return imgData;
}

function flowAccColor(t: number): [number, number, number] {
  // Blue (low) → Cyan → White (high)
  if (t < 0.33) {
    const s = t / 0.33;
    return [Math.round(20 + s * 80), Math.round(40 + s * 180), Math.round(160 + s * 95)];
  } else if (t < 0.66) {
    const s = (t - 0.33) / 0.33;
    return [Math.round(100 + s * 155), Math.round(220 + s * 35), Math.round(255)];
  } else {
    return [255, 255, 255];
  }
}

/** TWI → 绿→棕渐变 ImageData */
function renderTWIImage(
  twi: number[] | Float32Array,
  cols: number,
  rows: number,
): ImageData {
  const arr = twi instanceof Float32Array ? twi : new Float32Array(twi);
  // TWI typical range: 0–30 (clamp to 0–25 for color)
  const twiMin = 0;
  const twiMax = 25;

  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(cols, rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const px = (rows - 1 - r) * cols + c;
      const val = arr[i];
      if (!isFinite(val)) {
        const baseIdx = px * 4;
        imgData.data[baseIdx + 3] = 0;
        continue;
      }
      const t = Math.max(0, Math.min(1, (val - twiMin) / (twiMax - twiMin)));
      const baseIdx = px * 4;
      const [rd, g, b] = twiColor(t);
      imgData.data[baseIdx] = rd;
      imgData.data[baseIdx + 1] = g;
      imgData.data[baseIdx + 2] = b;
      imgData.data[baseIdx + 3] = 200;
    }
  }

  return imgData;
}

function twiColor(t: number): [number, number, number] {
  // Dry (ridge, low TWI) = brown, Wet (valley, high TWI) = green-blue
  // Low TWI (dry): #8B6914 brownish
  // Mid TWI: #A0C030 yellow-green
  // High TWI (wet): #1A6B3C dark green
  if (t < 0.5) {
    const s = t / 0.5;
    return [
      Math.round(139 + s * (160 - 139)),
      Math.round(105 + s * (192 - 105)),
      Math.round(20 + s * (48 - 20)),
    ];
  } else {
    const s = (t - 0.5) / 0.5;
    return [
      Math.round(160 - s * (160 - 26)),
      Math.round(192 - s * (192 - 107)),
      Math.round(48 + s * (60 - 48)),
    ];
  }
}

// ---- 导出函数 ----

/** 将水文分析结果渲染到 MapLibre ImageSource */
export function renderHydrologyLayer(
  map: maplibregl.Map,
  mode: HydrologyVisMode,
  params: RenderParams,
): void {
  const { cols, rows, bounds } = params;
  const { west, south, east, north } = bounds;
  const coordinates: maplibregl.Coordinates = [
    [west, north], [east, north], [east, south], [west, south],
  ];

  let imgData: ImageData | null = null;

  if (mode === 'flow-accumulation' && params.flowAcc) {
    imgData = renderFlowAccumulationImage(params.flowAcc, cols, rows);
  } else if (mode === 'twi' && params.twi) {
    imgData = renderTWIImage(params.twi, cols, rows);
  }

  if (!imgData) {
    removeHydrologyLayer(map);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  canvas.getContext('2d')!.putImageData(imgData, 0, 0);

  const source = map.getSource(SOURCE_ID) as maplibregl.ImageSource | undefined;
  if (source) {
    source.updateImage({ url: canvas.toDataURL(), coordinates });
  } else {
    map.addSource(SOURCE_ID, { type: 'image', url: canvas.toDataURL(), coordinates });
    map.addLayer({
      id: LAYER_ID,
      type: 'raster',
      source: SOURCE_ID,
      paint: { 'raster-opacity': 0.65, 'raster-fade-duration': 0 },
    });
  }
}

/** 渲染流域边界 GeoJSON */
export function renderWatershedBoundary(
  map: maplibregl.Map,
  watershed: number[] | Uint8Array,
  params: RenderParams,
): void {
  const { cols, rows, bounds } = params;
  const { west, south, east, north } = bounds;

  removeWatershedLayer(map);

  // Extract boundary from mask using marching squares simplification
  // For now: render as a filled GeoJSON polygon from the convex hull of watershed pixels
  const pixels: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (watershed[r * cols + c] === 1) {
        const lng = west + (c + 0.5) * (east - west) / cols;
        const lat = south + (rows - 1 - r + 0.5) * (north - south) / rows;
        pixels.push([lng, lat]);
      }
    }
  }

  if (pixels.length < 3) return;

  // Simple convex hull
  const hull = convexHull(pixels);
  if (hull.length < 3) return;

  // Close the ring
  hull.push(hull[0]);

  const geojson: GeoJSON.Feature = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [hull] },
    properties: {},
  };

  map.addSource(WATERSHED_SRC, { type: 'geojson', data: geojson });
  map.addLayer({
    id: WATERSHED_FILL_ID,
    type: 'fill',
    source: WATERSHED_SRC,
    paint: {
      'fill-color': '#2196F3',
      'fill-opacity': 0.2,
    },
  });
  map.addLayer({
    id: WATERSHED_LINE_ID,
    type: 'line',
    source: WATERSHED_SRC,
    paint: {
      'line-color': '#42A5F5',
      'line-width': 2,
      'line-opacity': 0.8,
    },
  });
}

export function removeHydrologyLayer(map: maplibregl.Map | null): void {
  if (!map) return;
  try { if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID); } catch { /* */ }
  try { if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID); } catch { /* */ }
}

export function removeWatershedLayer(map: maplibregl.Map | null): void {
  if (!map) return;
  try { if (map.getLayer(WATERSHED_LINE_ID)) map.removeLayer(WATERSHED_LINE_ID); } catch { /* */ }
  try { if (map.getLayer(WATERSHED_FILL_ID)) map.removeLayer(WATERSHED_FILL_ID); } catch { /* */ }
  try { if (map.getSource(WATERSHED_SRC)) map.removeSource(WATERSHED_SRC); } catch { /* */ }
}

// ---- 简易 Graham Scan 凸包 ----

function convexHull(points: [number, number][]): [number, number][] {
  if (points.length <= 3) return points.slice();

  // Find pivot (lowest Y, then leftmost X for geographic)
  let pivot = points[0];
  for (const p of points) {
    if (p[1] < pivot[1] || (p[1] === pivot[1] && p[0] < pivot[0])) {
      pivot = p;
    }
  }

  // Sort by polar angle
  const sorted = points
    .filter((p) => p !== pivot)
    .sort((a, b) => {
      const angleA = Math.atan2(a[1] - pivot[1], a[0] - pivot[0]);
      const angleB = Math.atan2(b[1] - pivot[1], b[0] - pivot[0]);
      return angleA - angleB;
    });

  const hull: [number, number][] = [pivot, sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      const c = sorted[i];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross <= 0) {
        hull.pop();
      } else {
        break;
      }
    }
    hull.push(sorted[i]);
  }

  return hull;
}

// ---- React Hook ----

/** 获取 MapLibre map 实例的 hook（供外部使用） */
export function useHydrologyRenderer() {
  const mapRef = useRef<maplibregl.Map | null>(null);

  const setMap = useCallback((map: maplibregl.Map | null) => {
    mapRef.current = map;
  }, []);

  const renderFlowAcc = useCallback((flowAcc: number[] | Float32Array, params: RenderParams) => {
    if (!mapRef.current) return;
    renderHydrologyLayer(mapRef.current, 'flow-accumulation', { ...params, flowAcc });
  }, []);

  const renderTWI = useCallback((twi: number[] | Float32Array, params: RenderParams) => {
    if (!mapRef.current) return;
    renderHydrologyLayer(mapRef.current, 'twi', { ...params, twi });
  }, []);

  const renderWatershed = useCallback((watershed: number[] | Uint8Array, params: RenderParams) => {
    if (!mapRef.current) return;
    renderWatershedBoundary(mapRef.current, watershed, params);
  }, []);

  const clearAll = useCallback(() => {
    if (!mapRef.current) return;
    removeHydrologyLayer(mapRef.current);
    removeWatershedLayer(mapRef.current);
  }, []);

  return { setMap, renderFlowAcc, renderTWI, renderWatershed, clearAll };
}
