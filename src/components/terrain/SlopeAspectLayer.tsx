// components/terrain/SlopeAspectLayer.tsx — 坡度/坡向分析图层
//
// 流程：DEM 格网采样 → Horn 1981 计算 → Canvas → MapLibre ImageSource
// 交互：切换模式（坡度/坡向/关）、悬停弹出坡度+坡向+高程

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { LngLat } from '../../core/types';
import {
  computeSlopeAspect,
  renderSlopeImageData,
  renderAspectImageData,
} from '../../core/terrain';
import { queryElevations } from '../../engines/elevation-api';
import type { SlopeAspectTool, SlopeAspectMode } from '../../tools/slope-aspect.tool';

// ---- constants ----

const GRID_SIZE = 40; // 40×40 = 1600 点
const NO_DATA = -9999;
const SOURCE_ID = 'palm-slope-aspect-src';
const LAYER_ID = 'palm-slope-aspect-layer';

interface DEMCache {
  data: Float32Array;
  rows: number;
  cols: number;
  bounds: [number, number, number, number]; // [west, south, east, north]
  centerLat: number;
}

// ---- component ----

interface SlopeAspectLayerProps {
  tool: SlopeAspectTool;
}

export function SlopeAspectLayer({ tool }: SlopeAspectLayerProps) {
  const [mode, setMode] = useState<SlopeAspectMode>(tool.mode);
  const [status, setStatus] = useState<'init' | 'sampling' | 'computing' | 'ready' | 'error'>(
    'init',
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    slope: number;
    aspect: number;
    elevation: number;
  } | null>(null);

  const cacheRef = useRef<DEMCache | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const slopeRef = useRef<Float32Array | null>(null);
  const aspectRef = useRef<Float32Array | null>(null);

  // ---- 同步 tool 回调 ----
  useEffect(() => {
    const onStateChange = () => {
      const newMode = tool.mode;
      setMode(newMode);
      // 重新渲染图层
      if (newMode === 'off') {
        removeLayer(mapRef.current);
      } else {
        renderLayer(mapRef.current, newMode, slopeRef.current, aspectRef.current, cacheRef.current);
      }
    };
    tool.setOnStateChange(onStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool]);

  // ---- 主流程 ----
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map;
    mapRef.current = map;

    startSampling(map);

    // 悬停事件
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!cacheRef.current || !slopeRef.current || !aspectRef.current) return;
      const { lng, lat } = e.lngLat;
      const cache = cacheRef.current;
      const [west, south, east, north] = cache.bounds;

      if (lng < west || lng > east || lat < south || lat > north) {
        setHoverInfo(null);
        return;
      }

      const col = Math.round(((lng - west) / (east - west)) * (cache.cols - 1));
      const row = Math.round(((north - lat) / (north - south)) * (cache.rows - 1));
      const idx = row * cache.cols + col;

      if (idx >= 0 && idx < cache.data.length && cache.data[idx] !== NO_DATA) {
        setHoverInfo({
          slope: slopeRef.current[idx],
          aspect: aspectRef.current[idx],
          elevation: Math.round(cache.data[idx]),
        });
      } else {
        setHoverInfo(null);
      }
    };

    map.on('mousemove', onMouseMove);

    return () => {
      abortRef.current?.abort();
      map.off('mousemove', onMouseMove);
      removeLayer(map);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- DEM 采样 ----
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
          Math.abs(dLng) * 111320 * Math.cos((((north + south) / 2) * Math.PI) / 180),
        ),
        onProgress: (completed, total) => setProgress(Math.round((completed / total) * 100)),
      });
      if (controller.signal.aborted) return;

      const data = new Float32Array(elevations.length);
      let validCount = 0;
      elevations.forEach((el, i) => {
        data[i] = el ?? NO_DATA;
        if (el !== null) validCount++;
      });
      if (validCount < 4) throw new Error('当前视野没有足够的高程数据');

      const centerLat = (north + south) / 2;
      const cache: DEMCache = {
        data,
        rows: GRID_SIZE,
        cols: GRID_SIZE,
        bounds: [west, south, east, north],
        centerLat,
      };
      cacheRef.current = cache;

      // ---- 计算坡度/坡向 ----
      setStatus('computing');
      const { slopeDeg, aspectDeg } = computeSlopeAspect(
        data,
        GRID_SIZE,
        GRID_SIZE,
        dLng,
        dLat,
        NO_DATA,
        centerLat,
      );
      slopeRef.current = slopeDeg;
      aspectRef.current = aspectDeg;

      setStatus('ready');
      console.log(`[SlopeAspect] 计算完成: ${GRID_SIZE}×${GRID_SIZE}, ${validCount} 有效点`);

      // 渲染
      if (mode !== 'off') {
        renderLayer(map, mode, slopeDeg, aspectDeg, cache);
      }
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : '未知错误');
      setStatus('error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  // ---- 模式切换按钮 ----
  const handleMode = useCallback(
    (m: SlopeAspectMode) => {
      tool.setMode(m);
      setMode(m);
      if (m === 'off') {
        removeLayer(mapRef.current);
      } else {
        renderLayer(mapRef.current, m, slopeRef.current, aspectRef.current, cacheRef.current);
      }
    },
    [tool],
  );

  const handleRetry = () => {
    if (mapRef.current) startSampling(mapRef.current);
  };

  // ---- 坡向读数 ----
  const aspectLabel = useMemo(() => {
    if (hoverInfo?.aspect == null || hoverInfo.aspect < 0) return '—';
    const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.floor(((hoverInfo.aspect + 22.5) % 360) / 45);
    return `${hoverInfo.aspect}° ${labels[idx]}`;
  }, [hoverInfo]);

  // ---- 模式按钮 ----
  const modeButtons: { mode: SlopeAspectMode; label: string; icon: string }[] = [
    { mode: 'slope', label: '坡度', icon: '📈' },
    { mode: 'aspect', label: '坡向', icon: '🧭' },
    { mode: 'off', label: '关闭', icon: '✕' },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        minWidth: 360,
        background: 'rgba(10,10,20,0.9)',
        backdropFilter: 'blur(16px)',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>
          📐 坡度/坡向分析
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          Horn 1981 · {GRID_SIZE}×{GRID_SIZE}
        </span>
      </div>

      {/* 状态提示 */}
      {status === 'sampling' && (
        <div style={{ fontSize: 11, color: '#ffab40' }}>正在采集高程格网... {progress}%</div>
      )}
      {status === 'computing' && (
        <div style={{ fontSize: 11, color: '#ffab40' }}>正在计算梯度卷积...</div>
      )}
      {status === 'error' && (
        <div style={{ fontSize: 11, color: '#ef5350' }}>
          {error}
          <button
            onClick={handleRetry}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              borderRadius: 4,
              padding: '1px 8px',
              marginLeft: 6,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            重试
          </button>
        </div>
      )}

      {/* 模式切换按钮组 */}
      <div style={{ display: 'flex', gap: 4 }}>
        {modeButtons.map((btn) => (
          <button
            key={btn.mode}
            onClick={() => handleMode(btn.mode)}
            disabled={status !== 'ready' && btn.mode !== 'off'}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: 6,
              padding: '6px 0',
              cursor: status !== 'ready' && btn.mode !== 'off' ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
              background: mode === btn.mode ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
              color: mode === btn.mode ? '#fff' : 'rgba(255,255,255,0.5)',
              opacity: status !== 'ready' && btn.mode !== 'off' ? 0.4 : 1,
              transition: 'all 0.15s',
            }}
          >
            {btn.icon} {btn.label}
          </button>
        ))}
      </div>

      {/* 悬停信息 */}
      {hoverInfo && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            fontSize: 11,
            color: 'rgba(255,255,255,0.7)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 8,
            marginTop: 4,
          }}
        >
          <span>
            📈 坡度 <b style={{ color: '#ffa726' }}>{hoverInfo.slope}°</b>
          </span>
          <span>
            🧭 坡向 <b style={{ color: '#42a5f5' }}>{aspectLabel}</b>
          </span>
          <span>
            ⛰️ 高程 <b style={{ color: '#66bb6a' }}>{hoverInfo.elevation}m</b>
          </span>
        </div>
      )}

      {/* 图例 */}
      {status === 'ready' && mode !== 'off' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            color: 'rgba(255,255,255,0.3)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            paddingTop: 6,
          }}
        >
          {mode === 'slope' ? (
            <>
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#228b22' }} />
              <span>0°</span>
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#68bb59' }} />
              <span>5°</span>
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#dcdc32' }} />
              <span>15°</span>
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#f59628' }} />
              <span>30°</span>
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#dc3c28' }} />
              <span>45°+</span>
            </>
          ) : (
            <>
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#3c64dc' }} />N
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#28b4c8' }} />
              NE
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#28b450' }} />E
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#b4c83c' }} />
              SE
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#dcc832' }} />S
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#f08c32' }} />
              SW
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#e6503c' }} />W
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#be50d2' }} />
              NW
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- ImageSource 渲染 ----

function renderLayer(
  map: maplibregl.Map | null,
  mode: SlopeAspectMode,
  slopeDeg: Float32Array | null,
  aspectDeg: Float32Array | null,
  cache: DEMCache | null,
): void {
  if (!map || !cache || mode === 'off') return;
  if (!slopeDeg || !aspectDeg) return;

  const canvas = document.createElement('canvas');
  canvas.width = cache.cols;
  canvas.height = cache.rows;
  const ctx = canvas.getContext('2d')!;

  const imgData =
    mode === 'slope'
      ? renderSlopeImageData(slopeDeg, cache.rows, cache.cols)
      : renderAspectImageData(aspectDeg, cache.rows, cache.cols);

  ctx.putImageData(imgData, 0, 0);

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
      paint: { 'raster-opacity': 0.6, 'raster-fade-duration': 0 },
    });
  }
}

function removeLayer(map: maplibregl.Map | null): void {
  if (!map) return;
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
}
