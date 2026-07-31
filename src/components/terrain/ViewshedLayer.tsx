// components/terrain/ViewshedLayer.tsx — 通视分析图层
//
// 流程：
//   点击地图放置视点 → DEM 格网采样 → horizon line 计算 → ImageSource 渲染
// 交互：
//   拖动视点、滑块调节观察者高度 (1-300m) 和半径 (1-50km)
//   鼠标悬停 → 弹出可见/不可见判定

import { useState, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { AlertCircle, LoaderCircle, MousePointer2, RotateCcw } from 'lucide-react';
import type { FeatureCollection, LineString } from 'geojson';
import type { LngLat } from '../../core/types';
import { computeViewshed, renderViewshedImageData } from '../../core/terrain';
import { queryElevations } from '../../engines/elevation-api';
import type { ViewshedTool } from '../../tools/viewshed.tool';

// ---- constants ----
const GRID_SIZE = 40;
const NO_DATA = -9999;
const SOURCE_ID = 'palm-viewshed-src';
const LAYER_ID = 'palm-viewshed-layer';
const BOUNDARY_SOURCE_ID = 'palm-viewshed-boundary-src';
const BOUNDARY_LAYER_ID = 'palm-viewshed-boundary-layer';

interface DEMCache {
  data: Float32Array;
  rows: number;
  cols: number;
  bounds: [number, number, number, number];
  cellSizeM: number;
}

interface ViewshedLayerProps {
  tool: ViewshedTool;
}

export function ViewshedLayer({ tool }: ViewshedLayerProps) {
  const [viewpoint, setViewpoint] = useState<LngLat | null>(null);
  const [observerH, setObserverH] = useState(tool.observerHeight);
  const [radiusKm, setRadiusKm] = useState(tool.radiusKm);
  const [status, setStatus] = useState<'idle' | 'sampling' | 'computing' | 'ready' | 'error'>(
    'idle',
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const cacheRef = useRef<DEMCache | null>(null);
  const visibilityRef = useRef<Float32Array | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ---- 同步 tool 回调 ----
  useEffect(() => {
    const onStateChange = () => {
      setObserverH(tool.observerHeight);
      setRadiusKm(tool.radiusKm);
      setViewpoint(tool.viewpoint);
    };
    tool.setOnStateChange(onStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool]);

  // ---- 初始化地图 ----
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map;
    mapRef.current = map;

    // 点击放置视点
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const pt: LngLat = [e.lngLat.lng, e.lngLat.lat];
      tool.setViewpoint(pt);
      setViewpoint(pt);
      placeViewpointMarker(map, pt);
      startAnalysis(map, pt, radiusKm, observerH);
    };

    map.on('click', onClick);

    // 悬停显示可见性
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      const vis = visibilityRef.current;
      const cache = cacheRef.current;
      if (!vis || !cache) {
        setHoverInfo(null);
        return;
      }
      const [west, south, east, north] = cache.bounds;
      const { lng, lat } = e.lngLat;
      if (lng < west || lng > east || lat < south || lat > north) {
        setHoverInfo(null);
        return;
      }
      const col = Math.round(((lng - west) / (east - west)) * (cache.cols - 1));
      const row = Math.round(((north - lat) / (north - south)) * (cache.rows - 1));
      const idx = row * cache.cols + col;
      if (idx >= 0 && idx < vis.length) {
        const v = vis[idx];
        if (v === 1) setHoverInfo('可见');
        else if (v === 0) setHoverInfo('被遮挡');
        else setHoverInfo(null);
      } else {
        setHoverInfo(null);
      }
    };

    map.on('mousemove', onMouseMove);

    return () => {
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      cleanup(map);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- DEM 采样 + 计算 ----
  async function startAnalysis(map: maplibregl.Map, vp: LngLat, radius: number, obsH: number) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('sampling');
    setProgress(0);
    setError(null);

    try {
      // 以视点为中心，半径转经纬度跨度（粗略）
      const degPerM = 1 / 111_320;
      const rDeg = radius * 1000 * degPerM;
      const rDegLng = rDeg / Math.cos((vp[1] * Math.PI) / 180);

      const west = vp[0] - rDegLng;
      const east = vp[0] + rDegLng;
      const south = Math.max(-85, vp[1] - rDeg);
      const north = Math.min(85, vp[1] + rDeg);

      const dLng = (east - west) / (GRID_SIZE - 1);
      const dLat = (north - south) / (GRID_SIZE - 1);
      const points: LngLat[] = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          points.push([west + c * dLng, north - r * dLat]);
        }
      }

      const elevations = await queryElevations(points, {
        signal: controller.signal,
        resolutionMeters: Math.min(
          Math.abs(dLat) * 111320,
          Math.abs(dLng) * 111320 * Math.cos((((north + south) / 2) * Math.PI) / 180),
        ),
        onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
      });
      if (controller.signal.aborted) return;

      const data = new Float32Array(elevations.length);
      let validCount = 0;
      elevations.forEach((el, i) => {
        data[i] = el ?? NO_DATA;
        if (el !== null) validCount++;
      });
      if (validCount < 4) throw new Error('高程数据不足');

      // 视点在格网中的行列
      const vpCol = Math.round(((vp[0] - west) / (east - west)) * (GRID_SIZE - 1));
      const vpRow = Math.round(((north - vp[1]) / (north - south)) * (GRID_SIZE - 1));

      // 米制近似（取中心纬度）
      const cellSizeM = dLat * 111_320;

      const cache: DEMCache = {
        data,
        rows: GRID_SIZE,
        cols: GRID_SIZE,
        bounds: [west, south, east, north],
        cellSizeM,
      };
      cacheRef.current = cache;

      // ---- 通视计算 ----
      setStatus('computing');
      const visibility = computeViewshed(
        data,
        GRID_SIZE,
        GRID_SIZE,
        cellSizeM,
        vpRow,
        vpCol,
        obsH,
        NO_DATA,
      );
      visibilityRef.current = visibility;

      setStatus('ready');
      console.log(`[Viewshed] 完成: ${GRID_SIZE}×${GRID_SIZE}, 半径${radius}km`);

      // 渲染
      renderToMap(map, visibility, cache);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : '未知错误');
      setStatus('error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function handleRetry() {
    if (viewpoint && mapRef.current) {
      startAnalysis(mapRef.current, viewpoint, radiusKm, observerH);
    }
  }

  return (
    <div className="pw-panel-stack">
      {status === 'idle' && (
        <div className="pw-panel-status">
          <MousePointer2 size={14} />
          <span>点击地图放置观察点</span>
        </div>
      )}
      {status === 'sampling' && (
        <div className="pw-panel-status is-warning">
          <LoaderCircle size={14} />
          <span>采集 DEM · {progress}%</span>
        </div>
      )}
      {status === 'computing' && (
        <div className="pw-panel-status is-warning">
          <LoaderCircle size={14} />
          <span>Horizon line 计算中</span>
        </div>
      )}
      {status === 'error' && (
        <div className="pw-panel-status is-danger">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button type="button" onClick={handleRetry} className="pw-secondary-button">
            <RotateCcw size={13} />
            重试
          </button>
        </div>
      )}

      {viewpoint && (
        <>
          <div className="pw-control-row">
            <label>观察高度</label>
            <input
              type="range"
              min={1}
              max={300}
              value={observerH}
              onChange={(e) => {
                const h = Number(e.target.value);
                setObserverH(h);
                tool.setObserverHeight(h);
              }}
              onMouseUp={() => {
                if (viewpoint && mapRef.current)
                  startAnalysis(mapRef.current, viewpoint, radiusKm, observerH);
              }}
              onTouchEnd={() => {
                if (viewpoint && mapRef.current)
                  startAnalysis(mapRef.current, viewpoint, radiusKm, observerH);
              }}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <output>{observerH} m</output>
          </div>

          <div className="pw-control-row">
            <label>可视半径</label>
            <input
              type="range"
              min={1}
              max={50}
              value={radiusKm}
              onChange={(e) => {
                const r = Number(e.target.value);
                setRadiusKm(r);
                tool.setRadiusKm(r);
              }}
              onMouseUp={() => {
                if (viewpoint && mapRef.current)
                  startAnalysis(mapRef.current, viewpoint, radiusKm, observerH);
              }}
              onTouchEnd={() => {
                if (viewpoint && mapRef.current)
                  startAnalysis(mapRef.current, viewpoint, radiusKm, observerH);
              }}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <output>{radiusKm} km</output>
          </div>
        </>
      )}

      {/* 悬停信息 */}
      {hoverInfo && (
        <div className={`pw-panel-status ${hoverInfo === '可见' ? 'is-success' : 'is-danger'}`}>
          <span>{hoverInfo}</span>
        </div>
      )}

      {status === 'ready' && (
        <div className="pw-legend-row">
          <span>
            <i className="pw-swatch" style={{ background: '#38c49b' }} />
            可见区域
          </span>
          <span>
            <i className="pw-swatch" style={{ background: '#e66b6b' }} />
            被遮挡区域
          </span>
          <span>松开滑块后重新计算</span>
        </div>
      )}
    </div>
  );
}

// ---- 视点标记 ----

function placeViewpointMarker(map: maplibregl.Map, pt: LngLat): void {
  // 用 GeoJSON source 做视点标记（比 DOM marker 更轻量）
  const srcId = 'palm-viewshed-vp-src';
  const layerId = 'palm-viewshed-vp-layer';

  if (map.getSource(srcId)) {
    (map.getSource(srcId) as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [pt[0], pt[1]] },
          properties: {},
        },
      ],
    });
    return;
  }

  map.addSource(srcId, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [pt[0], pt[1]] },
          properties: {},
        },
      ],
    },
  });

  map.addLayer({
    id: layerId,
    source: srcId,
    type: 'circle',
    paint: {
      'circle-radius': 8,
      'circle-color': '#ffeb3b',
      'circle-stroke-color': '#000',
      'circle-stroke-width': 2,
      'circle-opacity': 0.9,
    },
  });
}

// ---- ImageSource 渲染 ----

function renderToMap(map: maplibregl.Map, visibility: Float32Array, cache: DEMCache): void {
  const imgData = renderViewshedImageData(visibility, cache.rows, cache.cols);
  const scale = 6;
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = cache.cols;
  sourceCanvas.height = cache.rows;
  sourceCanvas.getContext('2d')!.putImageData(imgData, 0, 0);

  const canvas = document.createElement('canvas');
  canvas.width = cache.cols * scale;
  canvas.height = cache.rows * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  drawVisibilityBoundary(ctx, visibility, cache.rows, cache.cols, scale);

  const [west, south, east, north] = cache.bounds;
  const coordinates: maplibregl.Coordinates = [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];

  const source = map.getSource(SOURCE_ID) as maplibregl.ImageSource | undefined;
  if (source) {
    source.updateImage({ url: canvas.toDataURL(), coordinates });
  } else {
    map.addSource(SOURCE_ID, { type: 'image', url: canvas.toDataURL(), coordinates });
    map.addLayer({
      id: LAYER_ID,
      type: 'raster',
      source: SOURCE_ID,
      paint: {
        'raster-opacity': 0.82,
        'raster-fade-duration': 0,
        'raster-resampling': 'nearest',
      },
    });
  }

  const boundaryData = buildVisibilityBoundary(visibility, cache);
  const boundarySource = map.getSource(BOUNDARY_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (boundarySource) {
    boundarySource.setData(boundaryData);
  } else {
    map.addSource(BOUNDARY_SOURCE_ID, { type: 'geojson', data: boundaryData });
    map.addLayer({
      id: BOUNDARY_LAYER_ID,
      type: 'line',
      source: BOUNDARY_SOURCE_ID,
      paint: {
        'line-color': '#ffffff',
        'line-width': 3,
        'line-dasharray': [2, 1.5],
        'line-opacity': 0.95,
      },
    });
  }
}

function drawVisibilityBoundary(
  ctx: CanvasRenderingContext2D,
  visibility: Float32Array,
  rows: number,
  cols: number,
  scale: number,
): void {
  const valueAt = (row: number, col: number) => visibility[row * cols + col];
  const isSplit = (a: number, b: number) => (a === 1 && b === 0) || (a === 0 && b === 1);

  ctx.beginPath();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols - 1; col++) {
      if (!isSplit(valueAt(row, col), valueAt(row, col + 1))) continue;
      const x = (col + 1) * scale;
      ctx.moveTo(x, row * scale);
      ctx.lineTo(x, (row + 1) * scale);
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      if (!isSplit(valueAt(row, col), valueAt(row + 1, col))) continue;
      const y = (row + 1) * scale;
      ctx.moveTo(col * scale, y);
      ctx.lineTo((col + 1) * scale, y);
    }
  }
  ctx.rect(1, 1, cols * scale - 2, rows * scale - 2);
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.stroke();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.setLineDash([]);
}

function buildVisibilityBoundary(
  visibility: Float32Array,
  cache: DEMCache,
): FeatureCollection<LineString> {
  const [west, south, east, north] = cache.bounds;
  const dLng = (east - west) / (cache.cols - 1);
  const dLat = (north - south) / (cache.rows - 1);
  const lines: LineString['coordinates'][] = [];
  const valueAt = (row: number, col: number) => visibility[row * cache.cols + col];
  const isSplit = (a: number, b: number) => (a === 1 && b === 0) || (a === 0 && b === 1);

  for (let row = 0; row < cache.rows; row++) {
    for (let col = 0; col < cache.cols - 1; col++) {
      if (!isSplit(valueAt(row, col), valueAt(row, col + 1))) continue;
      const lng = west + (col + 0.5) * dLng;
      const lat = north - row * dLat;
      lines.push([
        [lng, lat - dLat / 2],
        [lng, lat + dLat / 2],
      ]);
    }
  }

  for (let row = 0; row < cache.rows - 1; row++) {
    for (let col = 0; col < cache.cols; col++) {
      if (!isSplit(valueAt(row, col), valueAt(row + 1, col))) continue;
      const lng = west + col * dLng;
      const lat = north - (row + 0.5) * dLat;
      lines.push([
        [lng - dLng / 2, lat],
        [lng + dLng / 2, lat],
      ]);
    }
  }

  lines.push([
    [west, north],
    [east, north],
    [east, south],
    [west, south],
    [west, north],
  ]);
  return {
    type: 'FeatureCollection',
    features: lines.map((coordinates) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    })),
  };
}

function cleanup(map: maplibregl.Map): void {
  try {
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
  } catch {
    /* */
  }
  try {
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  } catch {
    /* */
  }
  try {
    if (map.getLayer(BOUNDARY_LAYER_ID)) map.removeLayer(BOUNDARY_LAYER_ID);
  } catch {
    /* */
  }
  try {
    if (map.getSource(BOUNDARY_SOURCE_ID)) map.removeSource(BOUNDARY_SOURCE_ID);
  } catch {
    /* */
  }
  try {
    if (map.getLayer('palm-viewshed-vp-layer')) map.removeLayer('palm-viewshed-vp-layer');
  } catch {
    /* */
  }
  try {
    if (map.getSource('palm-viewshed-vp-src')) map.removeSource('palm-viewshed-vp-src');
  } catch {
    /* */
  }
}
