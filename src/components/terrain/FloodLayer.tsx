// components/terrain/FloodLayer.tsx — 海平面上升淹没图层 + 滑块控制
//
// 原理：高程 API 查询一次 → 缓存格网 → 滑块只更新 image source

import { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { AlertCircle, Info, LoaderCircle, RotateCcw } from 'lucide-react';
import type { LngLat } from '../../core/types';
import { queryElevations } from '../../engines/elevation-api';
import type { SeaLevelRiseTool } from '../../tools/sea-level-rise.tool';

interface FloodLayerProps {
  tool: SeaLevelRiseTool;
}

const GRID_SIZE = 48;
const FLOOD_SOURCE_ID = 'palm-flood-src';
const FLOOD_LAYER_ID = 'palm-flood-layer';

export type FloodConnectivityMode = 'connected' | 'all';

interface DEMCache {
  data: Float32Array;
  rows: number;
  cols: number;
  bounds: [number, number, number, number];
}

export function FloodLayer({ tool }: FloodLayerProps) {
  const [waterLevel, setWaterLevel] = useState(tool.getWaterLevel());
  const [connectivityMode, setConnectivityMode] = useState<FloodConnectivityMode>('connected');
  const [status, setStatus] = useState<'init' | 'sampling' | 'ready' | 'error'>('init');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ floodedPct: number; blockedDepressionCount: number } | null>(null);
  const cacheRef = useRef<DEMCache | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 初始化 + DEM 采样
  useEffect(() => {
    const engine = tool.getEngine();
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map;
    mapRef.current = map;

    // 注册引擎回调：滑块拖动时重绘
    tool.onRender((level: number) => {
      setWaterLevel(level);
      const res = renderFloodToMap(map, cacheRef.current, level, connectivityMode);
      if (res) setStats(res);
    });
    const handleStyleLoad = () => {
      const res = renderFloodToMap(map, cacheRef.current, tool.getWaterLevel(), connectivityMode);
      if (res) setStats(res);
    };
    map.on('style.load', handleStyleLoad);

    // 启动 DEM 采样
    startSampling(map);

    return () => {
      abortRef.current?.abort();
      tool.onRender(null);
      map.off('style.load', handleStyleLoad);
      if (map.getLayer(FLOOD_LAYER_ID)) map.removeLayer(FLOOD_LAYER_ID);
      if (map.getSource(FLOOD_SOURCE_ID)) map.removeSource(FLOOD_SOURCE_ID);
    };
  }, []);

  async function startSampling(map: maplibregl.Map) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('sampling');
    setProgress(0);
    setError(null);

    try {
      const bounds = map.getBounds();
      const west = bounds.getWest();
      const south = Math.max(-85, bounds.getSouth());
      const east = bounds.getEast();
      const north = Math.min(85, bounds.getNorth());

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
          Math.abs(dLng) * 111320 * Math.cos((north + south) / 2 * Math.PI / 180),
        ),
        onProgress: (completed, total) => setProgress(Math.round((completed / total) * 100)),
      });
      if (controller.signal.aborted) return;

      const data = new Float32Array(elevations.length);
      let validCount = 0;
      elevations.forEach((elevation, index) => {
        data[index] = elevation ?? -9999;
        if (elevation !== null) validCount++;
      });
      if (validCount === 0) throw new Error('当前视野没有可用高程数据');

      const cache: DEMCache = {
        data, rows: GRID_SIZE, cols: GRID_SIZE,
        bounds: [west, south, east, north],
      };
      cacheRef.current = cache;
      setStatus('ready');

      const res = renderFloodToMap(map, cache, waterLevel, connectivityMode);
      if (res) setStats(res);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : '未知错误');
      setStatus('error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  // 滑块
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const level = Number(e.target.value);
    setWaterLevel(level);
    tool.setWaterLevel(level);
    if (mapRef.current) {
      const res = renderFloodToMap(mapRef.current, cacheRef.current, level, connectivityMode);
      if (res) setStats(res);
    }
  }, [tool, connectivityMode]);

  const handleModeChange = (mode: FloodConnectivityMode) => {
    setConnectivityMode(mode);
    if (mapRef.current) {
      const res = renderFloodToMap(mapRef.current, cacheRef.current, waterLevel, mode);
      if (res) setStats(res);
    }
  };

  const handleRetry = () => {
    if (mapRef.current) startSampling(mapRef.current);
  };

  return (
    <div className="pw-panel-stack">
      <div className="pw-metric-block">
        <div className="pw-metric-item is-accent">
          <small>模拟水位</small>
          <strong>+{waterLevel} m</strong>
        </div>
        {stats && (
          <div className="pw-metric-item">
            <small>淹没覆盖率</small>
            <strong>{stats.floodedPct.toFixed(1)}%</strong>
          </div>
        )}
      </div>

      <div className="pw-segmented" aria-label="水文连通模式">
        <button
          type="button"
          className={connectivityMode === 'connected' ? 'is-active' : ''}
          onClick={() => handleModeChange('connected')}
          title="基于真实海岸线水流连通泛洪，山体阻挡后的内陆盆地不被淹没"
        >
          🌊 海洋水系连通
        </button>
        <button
          type="button"
          className={connectivityMode === 'all' ? 'is-active' : ''}
          onClick={() => handleModeChange('all')}
          title="全域低洼地势淹没（经典浴缸模型）"
        >
          🌐 低洼全域淹没
        </button>
      </div>

      {status === 'sampling' && (
        <>
          <div className="pw-panel-status is-warning">
            <LoaderCircle size={14} />
            <span>正在采集 {GRID_SIZE}×{GRID_SIZE} 高精高程格网 · {progress}%</span>
          </div>
          <div className="pw-progress-track"><span style={{ width: `${progress}%` }} /></div>
        </>
      )}
      {status === 'error' && (
        <div className="pw-panel-status is-danger">
          <AlertCircle size={14} />
          <span>高程数据获取失败：{error}</span>
          <button type="button" onClick={handleRetry} className="pw-secondary-button">
            <RotateCcw size={13} />重试
          </button>
        </div>
      )}

      {status === 'ready' && (
        <>
          <input
            type="range"
            min={0} max={100} value={waterLevel}
            onChange={handleChange}
            style={{ width: '100%', cursor: 'pointer' }}
          />
          <div className="pw-range-scale">
            <span>0m</span><span>25m</span><span>50m</span><span>75m</span><span>100m</span>
          </div>
          <div className="pw-panel-note">
            <Info size={14} />
            <span>
              {connectivityMode === 'connected'
                ? `真实水文连通模式：海水仅沿水系倒灌。${stats?.blockedDepressionCount ? `已排除 ${stats.blockedDepressionCount} 处被地形阻挡的封闭内陆盆地。` : ''}`
                : '经典浴缸模式：所有海拔低于水位的洼地无条件被淹没。'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Image Source 渲染 ----

function renderFloodToMap(
  map: maplibregl.Map,
  cache: DEMCache | null,
  level: number,
  connectivityMode: FloodConnectivityMode,
): { floodedPct: number; blockedDepressionCount: number } | null {
  if (!cache) return null;

  const { canvas, floodedCount, totalValid, blockedDepressionCount } = buildFloodCanvas(cache, level, connectivityMode);
  const [west, south, east, north] = cache.bounds;
  const imageUrl = canvas.toDataURL();
  const coordinates: maplibregl.Coordinates = [
    [west, north], [east, north], [east, south], [west, south],
  ];

  const source = map.getSource(FLOOD_SOURCE_ID) as maplibregl.ImageSource | undefined;
  if (source) {
    source.updateImage({ url: imageUrl, coordinates });
  } else {
    map.addSource(FLOOD_SOURCE_ID, {
      type: 'image',
      url: imageUrl,
      coordinates,
    });

    map.addLayer({
      id: FLOOD_LAYER_ID,
      type: 'raster',
      source: FLOOD_SOURCE_ID,
      paint: {
        'raster-opacity': 0.85,
        'raster-fade-duration': 100,
        'raster-resampling': 'linear',
      },
    });
  }

  const floodedPct = totalValid > 0 ? (floodedCount / totalValid) * 100 : 0;
  return { floodedPct, blockedDepressionCount };
}

function buildFloodCanvas(
  cache: DEMCache,
  level: number,
  connectivityMode: FloodConnectivityMode,
): { canvas: HTMLCanvasElement; floodedCount: number; totalValid: number; blockedDepressionCount: number } {
  const { data, rows, cols } = cache;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(cols, rows);

  let totalValid = 0;
  let rawBelowCount = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== -9999) {
      totalValid++;
      if (data[i]! < level) rawBelowCount++;
    }
  }

  // 连通性分析：广度优先搜索 (BFS)
  const isFlooded = new Uint8Array(rows * cols); // 0 or 1

  if (connectivityMode === 'connected') {
    const queue: number[] = []; // indices
    // 1. 种子识别：边缘所有低于水位的海洋点/边缘水系
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isBorder = (r === 0 || r === rows - 1 || c === 0 || c === cols - 1);
        const idx = r * cols + c;
        const el = data[idx]!;
        if (el !== -9999 && isBorder && el < level) {
          isFlooded[idx] = 1;
          queue.push(idx);
        }
      }
    }

    // 若边界无水体，但内部有海平面以下或负海拔（如大洋内陆海），也将 <= 0 处的边缘聚类作为种子
    if (queue.length === 0) {
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== -9999 && data[i]! <= 0) {
          isFlooded[i] = 1;
          queue.push(i);
        }
      }
    }

    // 2. BFS 沿水流连通路径漫延
    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++]!;
      const cr = Math.floor(curr / cols);
      const cc = curr % cols;

      const neighbors = [
        [cr - 1, cc],
        [cr + 1, cc],
        [cr, cc - 1],
        [cr, cc + 1],
      ];

      for (const [nr, nc] of neighbors) {
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          const nidx = nr * cols + nc;
          if (!isFlooded[nidx] && data[nidx] !== -9999 && data[nidx]! < level) {
            isFlooded[nidx] = 1;
            queue.push(nidx);
          }
        }
      }
    }
  } else {
    // 浴缸全域模式
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== -9999 && data[i]! < level) {
        isFlooded[i] = 1;
      }
    }
  }

  let floodedCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const px = idx * 4;
      if (isFlooded[idx]) {
        floodedCount++;
        const depth = Math.max(0, level - data[idx]!);
        // 根据淹没深度微调水深质感
        const alpha = Math.min(240, Math.max(160, Math.round(160 + depth * 1.5)));
        imgData.data[px] = 18;
        imgData.data[px + 1] = 112;
        imgData.data[px + 2] = 224;
        imgData.data[px + 3] = alpha;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const blockedDepressionCount = Math.max(0, rawBelowCount - floodedCount);
  return { canvas, floodedCount, totalValid, blockedDepressionCount };
}
