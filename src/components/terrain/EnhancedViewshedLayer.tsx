// components/terrain/EnhancedViewshedLayer.tsx — 增强通视分析 UI (v0.6)
//
// 四种子模式：
//   1. multi-observer  — 多观察点合成（union/intersect/majority）
//   2. signal           — 信号覆盖热力
//   3. radar            — 雷达扇形可视域
//   4. inter-vis        — 多点互视矩阵

import { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { AlertCircle, LoaderCircle, MousePointer2, RotateCcw, Trash2, Eye } from 'lucide-react';
import type { LngLat } from '../../core/types';
import {
  renderViewshedImageData,
  computeMultiObserverViewshed,
  renderMultiObserverImageData,
  computeSignalCoverage,
  renderSignalCoverageImageData,
  computeRadarSectorViewshed,
  renderRadarSectorImageData,
  buildSectorPolygon,
  computeInterVisibilityMatrix,
} from '../../core/terrain';
import type {
  MultiObserverStrategy,
  ObserverPoint,
  SignalCoverageParams,
} from '../../core/terrain';
import { queryElevations } from '../../engines/elevation-api';
import type {
  EnhancedViewshedTool,
  EnhancedViewshedMode,
} from '../../tools/enhanced-viewshed.tool';
import { MODE_LABELS } from '../../tools/enhanced-viewshed.tool';

// ---- constants ----
const NO_DATA = -9999;
const SOURCE_ID = 'palm-evshed-src';
const LAYER_ID = 'palm-evshed-layer';

interface DEMCache {
  data: Float32Array;
  rows: number;
  cols: number;
  bounds: [number, number, number, number];
  cellSizeM: number;
}

interface EnhancedViewshedLayerProps {
  tool: EnhancedViewshedTool;
}

export function EnhancedViewshedLayer({ tool }: EnhancedViewshedLayerProps) {
  const [mode, setMode] = useState<EnhancedViewshedMode>(tool.state.mode);
  const [observers, setObservers] = useState<ObserverPoint[]>(tool.state.observers);
  const [radiusKm, setRadiusKm] = useState(tool.state.radiusKm);
  const [gridSize, setGridSize] = useState(tool.state.gridSize);

  // Signal params
  const [sigParams, setSigParams] = useState<SignalCoverageParams>({ ...tool.state.signalParams });

  // Radar params
  const [radarAzimuth, setRadarAzimuth] = useState(tool.state.radarAzimuthDeg);
  const [radarBeamWidth, setRadarBeamWidth] = useState(tool.state.radarBeamWidthDeg);

  // Multi-observer strategy
  const [multiStrategy, setMultiStrategy] = useState<MultiObserverStrategy>('union');

  // Status
  const [status, setStatus] = useState<'idle' | 'sampling' | 'computing' | 'ready' | 'error'>(
    'idle',
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);

  // Inter-vis results
  const [interVisResult, setInterVisResult] = useState<Array<{
    from: string;
    to: string;
    visible: boolean;
    distanceM: number;
  }> | null>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const cacheRef = useRef<DEMCache | null>(null);
  const visibilityRef = useRef<Float32Array | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handleMapClickRef = useRef<((pt: LngLat) => void) | null>(null);

  // ---- sync tool → local state ----
  useEffect(() => {
    const onStateChange = () => {
      setMode(tool.state.mode);
      setObservers([...tool.state.observers]);
      setRadiusKm(tool.state.radiusKm);
      setGridSize(tool.state.gridSize);
      setSigParams({ ...tool.state.signalParams });
      setRadarAzimuth(tool.state.radarAzimuthDeg);
      setRadarBeamWidth(tool.state.radarBeamWidthDeg);
    };
    tool.setOnStateChange(onStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool]);

  // ---- mount: get map ref ----
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map;
    mapRef.current = map;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      handleMapClickRef.current?.([e.lngLat.lng, e.lngLat.lat]);
    };

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
      } else setHoverInfo(null);
    };

    map.on('click', onClick);
    map.on('mousemove', onMouseMove);

    return () => {
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      cleanupLayers(map);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- click handler ----
  const handleMapClick = useCallback(
    (pt: LngLat) => {
      switch (mode) {
        case 'multi-observer':
          tool.addObserver(pt, 2);
          drawObserverMarkers();
          break;
        case 'signal': {
          tool.clearObservers();
          tool.addObserver(pt, tool.state.signalParams.antennaHeightM);
          drawObserverMarkers();
          triggerAnalysis(pt);
          break;
        }
        case 'radar': {
          tool.clearObservers();
          tool.addObserver(pt, 2);
          drawObserverMarkers();
          triggerAnalysis(pt);
          break;
        }
        case 'inter-vis':
          tool.addObserver(pt, 2);
          drawObserverMarkers();
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, tool, radiusKm, gridSize, sigParams, radarAzimuth, radarBeamWidth],
  );
  handleMapClickRef.current = handleMapClick;

  // ---- trigger computation ----
  function triggerAnalysis(vp?: LngLat) {
    const map = mapRef.current;
    if (!map) return;
    const center =
      vp ??
      (tool.state.observers[0]
        ? ([tool.state.observers[0].lng, tool.state.observers[0].lat] as LngLat)
        : null);
    if (!center) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('sampling');
    setProgress(0);
    setError(null);

    (async () => {
      try {
        // DEM 采样
        const degPerM = 1 / 111_320;
        const rDeg = radiusKm * 1000 * degPerM;
        const rDegLng = rDeg / Math.cos((center[1] * Math.PI) / 180);
        const west = center[0] - rDegLng;
        const east = center[0] + rDegLng;
        const south = Math.max(-85, center[1] - rDeg);
        const north = Math.min(85, center[1] + rDeg);
        const dLng = (east - west) / (gridSize - 1);
        const dLat = (north - south) / (gridSize - 1);

        const points: LngLat[] = [];
        for (let r = 0; r < gridSize; r++)
          for (let c = 0; c < gridSize; c++) points.push([west + c * dLng, north - r * dLat]);

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

        const cache: DEMCache = {
          data,
          rows: gridSize,
          cols: gridSize,
          bounds: [west, south, east, north],
          cellSizeM: dLat * 111_320,
        };
        cacheRef.current = cache;
        setStatus('computing');

        // 按模式计算
        switch (mode) {
          case 'multi-observer': {
            if (tool.state.observers.length < 2) {
              setStatus('idle');
              return;
            }
            const result = computeMultiObserverViewshed(
              data,
              gridSize,
              gridSize,
              cache.cellSizeM,
              cache.bounds,
              tool.state.observers,
              multiStrategy,
              NO_DATA,
            );
            visibilityRef.current = result.visibility;
            break;
          }
          case 'signal': {
            if (tool.state.observers.length < 1) {
              setStatus('idle');
              return;
            }
            const result = computeSignalCoverage(
              data,
              gridSize,
              gridSize,
              cache.cellSizeM,
              cache.bounds,
              tool.state.observers[0]!,
              tool.state.signalParams,
              NO_DATA,
            );
            visibilityRef.current = result.rssi; // reuse ref for hover check
            renderSignalToMap(map, result, cache);
            setStatus('ready');
            return;
          }
          case 'radar': {
            if (tool.state.observers.length < 1) {
              setStatus('idle');
              return;
            }
            const result = computeRadarSectorViewshed(
              data,
              gridSize,
              gridSize,
              cache.cellSizeM,
              cache.bounds,
              tool.state.observers[0]!,
              radarAzimuth,
              radarBeamWidth,
              radiusKm,
              NO_DATA,
            );
            visibilityRef.current = result.visibility;
            renderRadarSectorToMap(map, result, cache);
            setStatus('ready');
            return;
          }
          case 'inter-vis': {
            const obs = tool.state.observers;
            if (obs.length < 2) {
              setStatus('idle');
              return;
            }
            const result = computeInterVisibilityMatrix(obs, (lng, lat) => {
              const col = Math.round(((lng - west) / (east - west)) * (gridSize - 1));
              const row = Math.round(((north - lat) / (north - south)) * (gridSize - 1));
              if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return null;
              const v = data[row * gridSize + col];
              return v !== undefined && v !== null && v !== NO_DATA && Number.isFinite(v)
                ? v
                : null;
            });
            const pairs: Array<{ from: string; to: string; visible: boolean; distanceM: number }> =
              [];
            for (let i = 0; i < obs.length; i++) {
              for (let j = i + 1; j < obs.length; j++) {
                const p = result.matrix[i]?.[j];
                if (p) pairs.push(p);
              }
            }
            setInterVisResult(pairs);
            // 清除 raster 图层但保留 observer markers
            cleanupRasterOnly(map);
            drawObserverMarkers();
            setStatus('ready');
            return;
          }
        }

        // 默认：ImageSource 渲染 (multi-observer)
        const vis = visibilityRef.current!;
        renderRasterToMap(map, vis, cache, mode, multiStrategy);
        setStatus('ready');
        console.log(`[EnhancedViewshed] ${mode} 完成: ${gridSize}×${gridSize}`);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : '未知错误');
        setStatus('error');
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    })();
  }

  // ---- observer markers ----
  function drawObserverMarkers() {
    const map = mapRef.current;
    if (!map) return;

    const srcId = 'palm-evshed-obs-src';
    const layerId = 'palm-evshed-obs-layer';
    const obs = tool.state.observers;

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: obs.map((o) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [o.lng, o.lat] },
        properties: { id: o.id, heightM: o.heightM },
      })),
    };

    if (map.getSource(srcId)) {
      (map.getSource(srcId) as maplibregl.GeoJSONSource).setData(geojson);
    } else {
      map.addSource(srcId, { type: 'geojson', data: geojson });
      map.addLayer(
        {
          id: layerId,
          source: srcId,
          type: 'circle',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 16, 10],
            'circle-color': '#ffeb3b',
            'circle-stroke-color': '#000',
            'circle-stroke-width': 2,
            'circle-opacity': 0.92,
          },
        },
        // 确保标记层在所有 raster/symbol 图层的上方
        map.getLayer(LAYER_ID) ? LAYER_ID : undefined,
      );
    }
  }

  // ---- compute button ----
  function handleCompute() {
    triggerAnalysis();
  }

  // ---- reset ----
  function handleReset() {
    tool.clearObservers();
    setInterVisResult(null);
    setStatus('idle');
    const map = mapRef.current;
    if (map) cleanupLayers(map);
  }

  return (
    <div className="pw-panel-stack">
      {/* ---- 模式选择 (segmented control) ---- */}
      <div className="pw-segmented">
        {(Object.entries(MODE_LABELS) as [EnhancedViewshedMode, string][]).map(([m, label]) => (
          <button
            key={m}
            type="button"
            className={mode === m ? 'is-active' : ''}
            onClick={() => {
              tool.setMode(m);
              setInterVisResult(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---- 状态栏 ---- */}
      {status === 'idle' && (
        <div className="pw-panel-status">
          <MousePointer2 size={14} />
          <span>
            {mode === 'multi-observer' && '点击地图放置多个观察点'}
            {mode === 'signal' && '点击地图放置发射塔'}
            {mode === 'radar' && '点击地图放置雷达站'}
            {mode === 'inter-vis' && '点击地图放置多个点'}
          </span>
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
          <span>计算中</span>
        </div>
      )}
      {status === 'error' && (
        <div className="pw-panel-status is-danger">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button type="button" onClick={handleCompute} className="pw-secondary-button">
            <RotateCcw size={13} />
            重试
          </button>
        </div>
      )}

      {/* ---- 通用参数 ---- */}
      <div className="pw-control-row">
        <label>分析半径</label>
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
          onMouseUp={handleCompute}
          onTouchEnd={handleCompute}
          style={{ width: '100%', cursor: 'pointer' }}
        />
        <output>{radiusKm} km</output>
      </div>

      <div className="pw-control-row">
        <label>格网精度</label>
        <input
          type="range"
          min={20}
          max={80}
          step={10}
          value={gridSize}
          onChange={(e) => {
            const n = Number(e.target.value);
            setGridSize(n);
            tool.setGridSize(n);
          }}
          onMouseUp={handleCompute}
          onTouchEnd={handleCompute}
          style={{ width: '100%', cursor: 'pointer' }}
        />
        <output>
          {gridSize}×{gridSize}
        </output>
      </div>

      {/* ---- 模式特定参数 ---- */}

      {/* Multi-observer */}
      {mode === 'multi-observer' && (
        <>
          <div className="pw-control-row">
            <label>合成策略</label>
            <select
              value={multiStrategy}
              onChange={(e) => setMultiStrategy(e.target.value as MultiObserverStrategy)}
              className="pw-select"
            >
              <option value="union">联合 (任意可见)</option>
              <option value="intersect">交集 (全可见)</option>
              <option value="majority">多数 (覆盖率)</option>
            </select>
          </div>

          {observers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ color: 'var(--pw-text-muted)', fontSize: 10 }}>
                观察点 ({observers.length})
              </label>
              {observers.map((o, i) => (
                <div key={o.id} className="pw-control-row" style={{ gap: 4 }}>
                  <label style={{ fontSize: 10, gridColumn: '1 / -1', marginBottom: 0 }}>
                    #{i + 1}: {o.lng.toFixed(4)} {o.lat.toFixed(4)}
                  </label>
                  <div style={{ gridColumn: '2', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      value={o.heightM}
                      min={1}
                      max={300}
                      step={1}
                      style={{
                        width: 56,
                        padding: '2px 4px',
                        border: '1px solid var(--pw-border)',
                        borderRadius: 3,
                        background: '#11161a',
                        color: 'var(--pw-text)',
                        fontSize: 12,
                      }}
                      onChange={(e) =>
                        tool.updateObserver(o.id, { heightM: Number(e.target.value) })
                      }
                    />
                    <span style={{ fontSize: 11, color: 'var(--pw-text-faint)' }}>m</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => tool.removeObserver(o.id)}
                    style={{
                      gridColumn: '3',
                      justifySelf: 'end',
                      padding: '2px 4px',
                      border: '1px solid var(--pw-border)',
                      borderRadius: 3,
                      background: 'transparent',
                      color: 'var(--pw-danger)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="移除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Signal */}
      {mode === 'signal' && (
        <>
          <div className="pw-control-row">
            <label>频率</label>
            <input
              type="number"
              value={sigParams.frequencyMHz}
              min={100}
              max={6000}
              step={100}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSigParams((p) => ({ ...p, frequencyMHz: v }));
                tool.setSignalParams({ frequencyMHz: v });
              }}
              style={{
                width: '100%',
                padding: '3px 6px',
                border: '1px solid var(--pw-border)',
                borderRadius: 3,
                background: '#11161a',
                color: 'var(--pw-text)',
                fontSize: 12,
              }}
            />
            <output>MHz</output>
          </div>
          <div className="pw-control-row">
            <label>功率</label>
            <input
              type="number"
              value={sigParams.powerDBm}
              min={10}
              max={60}
              step={1}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSigParams((p) => ({ ...p, powerDBm: v }));
                tool.setSignalParams({ powerDBm: v });
              }}
              style={{
                width: '100%',
                padding: '3px 6px',
                border: '1px solid var(--pw-border)',
                borderRadius: 3,
                background: '#11161a',
                color: 'var(--pw-text)',
                fontSize: 12,
              }}
            />
            <output>dBm</output>
          </div>
          <div className="pw-control-row">
            <label>天线高度 (m)</label>
            <input
              type="range"
              min={1}
              max={200}
              value={sigParams.antennaHeightM}
              onChange={(e) => {
                const h = Number(e.target.value);
                setSigParams((p) => ({ ...p, antennaHeightM: h }));
                tool.setSignalParams({ antennaHeightM: h });
              }}
              onMouseUp={handleCompute}
              onTouchEnd={handleCompute}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <output>{sigParams.antennaHeightM} m</output>
          </div>
          <div className="pw-control-row">
            <label>波束方向</label>
            <select
              value={sigParams.azimuthDeg ?? -1}
              onChange={(e) => {
                const v = Number(e.target.value);
                tool.setSignalParams({ azimuthDeg: v < 0 ? undefined : v });
                setSigParams((p) => ({ ...p, azimuthDeg: v < 0 ? undefined : v }));
              }}
              className="pw-select"
              style={{ gridColumn: '2 / -1' }}
            >
              <option value={-1}>全向 (360°)</option>
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <option key={a} value={a}>
                  {a}°
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Radar */}
      {mode === 'radar' && (
        <>
          <div className="pw-control-row">
            <label>中心方位角</label>
            <input
              type="range"
              min={0}
              max={360}
              value={radarAzimuth}
              onChange={(e) => {
                const v = Number(e.target.value);
                setRadarAzimuth(v);
                tool.setRadarAzimuth(v);
              }}
              onMouseUp={handleCompute}
              onTouchEnd={handleCompute}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <output>{radarAzimuth}°</output>
          </div>
          <div className="pw-control-row">
            <label>开角</label>
            <input
              type="range"
              min={10}
              max={180}
              step={5}
              value={radarBeamWidth}
              onChange={(e) => {
                const v = Number(e.target.value);
                setRadarBeamWidth(v);
                tool.setRadarBeamWidth(v);
              }}
              onMouseUp={handleCompute}
              onTouchEnd={handleCompute}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <output>{radarBeamWidth}°</output>
          </div>
        </>
      )}

      {/* Inter-vis */}
      {mode === 'inter-vis' && observers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ color: 'var(--pw-text-muted)', fontSize: 10 }}>
            观察点 ({observers.length})
          </label>
          {observers.map((o, i) => (
            <div key={o.id} className="pw-control-row" style={{ gap: 4 }}>
              <label style={{ fontSize: 10, gridColumn: '1 / -1', marginBottom: 0 }}>
                #{i + 1}: {o.lng.toFixed(4)} {o.lat.toFixed(4)}
              </label>
              <div style={{ gridColumn: '2', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  value={o.heightM}
                  min={1}
                  max={300}
                  step={1}
                  style={{
                    width: 56,
                    padding: '2px 4px',
                    border: '1px solid var(--pw-border)',
                    borderRadius: 3,
                    background: '#11161a',
                    color: 'var(--pw-text)',
                    fontSize: 12,
                  }}
                  onChange={(e) => tool.updateObserver(o.id, { heightM: Number(e.target.value) })}
                />
                <span style={{ fontSize: 11, color: 'var(--pw-text-faint)' }}>m</span>
              </div>
              <button
                type="button"
                onClick={() => tool.removeObserver(o.id)}
                style={{
                  gridColumn: '3',
                  justifySelf: 'end',
                  padding: '2px 4px',
                  border: '1px solid var(--pw-border)',
                  borderRadius: 3,
                  background: 'transparent',
                  color: 'var(--pw-danger)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="移除"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---- Inter-vis 结果 ---- */}
      {mode === 'inter-vis' && interVisResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ color: 'var(--pw-text-muted)', fontSize: 10 }}>互视结果</label>
          <div
            style={{
              maxHeight: 200,
              overflowY: 'auto',
              border: '1px solid var(--pw-border)',
              borderRadius: 4,
              background: '#0d1217',
            }}
          >
            {interVisResult.map((p, i) => {
              // p.from/p.to are observer ID strings like "obs-1712345678901"
              // Find their indices in the observers list
              const fromIdx = observers.findIndex((o) => o.id === p.from);
              const toIdx = observers.findIndex((o) => o.id === p.to);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 8px',
                    fontSize: 11,
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <span style={{ color: 'var(--pw-text-muted)', minWidth: 32 }}>
                    #{fromIdx >= 0 ? fromIdx + 1 : '?'}→#{toIdx >= 0 ? toIdx + 1 : '?'}
                  </span>
                  <span style={{ flex: 1, color: 'var(--pw-text)' }}>
                    {(p.distanceM / 1000).toFixed(1)} km
                  </span>
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: 3,
                      fontSize: 10,
                      background: p.visible ? '#38c49b33' : '#e66b6b33',
                      color: p.visible ? '#1a7a5a' : '#c0392b',
                    }}
                  >
                    {p.visible ? '可见' : '遮挡'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- 操作按钮 ---- */}
      {observers.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            className="pw-primary-button"
            onClick={handleCompute}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Eye size={14} />
            计算
          </button>
          <button
            type="button"
            className="pw-secondary-button"
            onClick={handleReset}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <RotateCcw size={14} />
            重置
          </button>
        </div>
      )}

      {/* hover 提示 */}
      {hoverInfo && mode !== 'signal' && mode !== 'inter-vis' && (
        <div className={`pw-panel-status ${hoverInfo === '可见' ? 'is-success' : 'is-danger'}`}>
          <span>{hoverInfo}</span>
        </div>
      )}

      {/* 图例 */}
      {status === 'ready' && (
        <div className="pw-legend-row">
          {mode === 'multi-observer' && multiStrategy === 'majority' ? (
            <>
              <span>
                <i className="pw-swatch" style={{ background: '#dc3c28' }} />
                0% 覆盖
              </span>
              <span>
                <i className="pw-swatch" style={{ background: '#dcc832' }} />
                50%
              </span>
              <span>
                <i className="pw-swatch" style={{ background: '#38c49b' }} />
                100% 覆盖
              </span>
            </>
          ) : mode === 'signal' ? (
            <>
              <span>
                <i className="pw-swatch" style={{ background: '#38c49b' }} />强 &ge;-70dBm
              </span>
              <span>
                <i className="pw-swatch" style={{ background: '#dcc832' }} />中 &ge;-85dBm
              </span>
              <span>
                <i className="pw-swatch" style={{ background: '#f58c28' }} />弱 &ge;-100dBm
              </span>
              <span>
                <i className="pw-swatch" style={{ background: '#a01e1e' }} />无
              </span>
            </>
          ) : (
            <>
              <span>
                <i className="pw-swatch" style={{ background: '#38c49b' }} />
                可见
              </span>
              <span>
                <i className="pw-swatch" style={{ background: '#e66b6b' }} />
                遮挡
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
//  渲染 helpers（独立函数，避免 JSX 内部膨胀）
// ============================================================

function renderRasterToMap(
  map: maplibregl.Map,
  visibility: Float32Array,
  cache: DEMCache,
  mode: EnhancedViewshedMode,
  strategy?: MultiObserverStrategy,
): void {
  let imgData: ImageData;
  if (mode === 'multi-observer' && strategy) {
    imgData = renderMultiObserverImageData({
      visibility,
      perObserver: [],
      rows: cache.rows,
      cols: cache.cols,
      bounds: cache.bounds,
      observers: [],
      strategy,
    });
  } else {
    imgData = renderViewshedImageData(visibility, cache.rows, cache.cols);
  }

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
      paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' },
    });
  }
}

function renderSignalToMap(
  map: maplibregl.Map,
  result: ReturnType<typeof computeSignalCoverage>,
  cache: DEMCache,
): void {
  const imgData = renderSignalCoverageImageData(result);
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
      paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' },
    });
  }
}

function renderRadarSectorToMap(
  map: maplibregl.Map,
  result: ReturnType<typeof computeRadarSectorViewshed>,
  cache: DEMCache,
): void {
  const imgData = renderRadarSectorImageData(result.visibility, cache.rows, cache.cols);
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
      paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' },
    });
  }

  // 扇形边框
  const sectorPoly = buildSectorPolygon(
    result.observer,
    result.azimuthDeg,
    result.beamWidthDeg,
    result.radiusKm,
  );
  const sectorSrcId = 'palm-evshed-sector-src';
  const sectorLyrId = 'palm-evshed-sector-lyr';
  if (map.getSource(sectorSrcId)) {
    (map.getSource(sectorSrcId) as maplibregl.GeoJSONSource).setData(sectorPoly);
  } else {
    map.addSource(sectorSrcId, { type: 'geojson', data: sectorPoly });
    map.addLayer({
      id: sectorLyrId,
      source: sectorSrcId,
      type: 'line',
      paint: {
        'line-color': '#ffffff',
        'line-width': 2,
        'line-opacity': 0.9,
        'line-dasharray': [3, 2],
      },
    });
  }
}

function cleanupLayers(map: maplibregl.Map): void {
  const srcsToRemove = [SOURCE_ID, 'palm-evshed-obs-src', 'palm-evshed-sector-src'];
  const lyrsToRemove = [LAYER_ID, 'palm-evshed-obs-layer', 'palm-evshed-sector-lyr'];
  for (const id of lyrsToRemove)
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* */
    }
  for (const id of srcsToRemove)
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch {
      /* */
    }
}

/** 仅清除 raster 图层，保留 observer markers */
function cleanupRasterOnly(map: maplibregl.Map): void {
  for (const id of [LAYER_ID, 'palm-evshed-sector-lyr'])
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* */
    }
  for (const id of [SOURCE_ID, 'palm-evshed-sector-src'])
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch {
      /* */
    }
}
