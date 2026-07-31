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

const GRID_SIZE = 32;
const FLOOD_SOURCE_ID = 'palm-flood-src';
const FLOOD_LAYER_ID = 'palm-flood-layer';

interface DEMCache {
  data: Float32Array;
  rows: number;
  cols: number;
  bounds: [number, number, number, number];
}

export function FloodLayer({ tool }: FloodLayerProps) {
  const [waterLevel, setWaterLevel] = useState(tool.getWaterLevel());
  const [status, setStatus] = useState<'init' | 'sampling' | 'ready' | 'error'>('init');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
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
      renderFloodToMap(map, cacheRef.current, level);
    });
    const handleStyleLoad = () => {
      renderFloodToMap(map, cacheRef.current, tool.getWaterLevel());
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

      console.log(`[FloodLayer] 高程采样完成: ${validCount}/${GRID_SIZE * GRID_SIZE} 有效点`);
      renderFloodToMap(map, cache, waterLevel);
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
    renderFloodToMap(mapRef.current!, cacheRef.current, level);
  }, [tool]);

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
      </div>

      {status === 'sampling' && (
        <>
          <div className="pw-panel-status is-warning">
            <LoaderCircle size={14} />
            <span>正在采集 {GRID_SIZE}×{GRID_SIZE} 高程格网 · {progress}%</span>
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
            <span>蓝色区域表示完全淹没范围，拖动滑块可实时更新。</span>
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
): void {
  if (!cache) return;

  const canvas = buildFloodCanvas(cache, level);
  const [west, south, east, north] = cache.bounds;
  const imageUrl = canvas.toDataURL();
  const coordinates: maplibregl.Coordinates = [
    [west, north], [east, north], [east, south], [west, south],
  ];

  const source = map.getSource(FLOOD_SOURCE_ID) as maplibregl.ImageSource | undefined;
  if (source) {
    source.updateImage({ url: imageUrl, coordinates });
    return;
  }

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
      'raster-opacity': 1,
      'raster-fade-duration': 0,
      'raster-resampling': 'nearest',
    },
  });
}

function buildFloodCanvas(cache: DEMCache, level: number): HTMLCanvasElement {
  const { data, rows, cols } = cache;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(cols, rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const el = data[r * cols + c];
      const px = (r * cols + c) * 4;
      if (el !== -9999 && el < level) {
        imgData.data[px] = 18;
        imgData.data[px + 1] = 112;
        imgData.data[px + 2] = 214;
        imgData.data[px + 3] = 255;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
