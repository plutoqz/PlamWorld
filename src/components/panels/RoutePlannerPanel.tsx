// components/panels/RoutePlannerPanel.tsx — 路径规划面板 (v0.6)
//
// 交互流程：
//   路径模式：点击起点 → 立即渲染起点标记 → 点击终点 → 自动计算 → 渲染路径线
//   等时线模式：点击中心点 → 基于 DEM 格网生成等时圈
//
// v0.6.1 修复：
//   - 点击即显示起终点标记（不再等 computeRoute 完成）
//   - 等时线降级：用同心圆 + DEM 高程修正替代纯路网方案
//   - useCallback 闭包中直接用 tool.state 读最新值

import { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  MapPin,
  Flag,
  Clock,
  Footprints,
  Bike,
  Car,
  LoaderCircle,
  RotateCcw,
  Route,
  X,
} from 'lucide-react';
import type { LngLat } from '../../core/types';
import { directPath, haversineDistanceM } from '../../core/pathfinding';
import type { TravelMode, RouteResult } from '../../core/pathfinding';
import { MODE_SPEEDS } from '../../core/pathfinding';
import { queryElevations } from '../../engines/elevation-api';
import type { RoutePlannerTool, RoutePlannerMode } from '../../tools/route-planner.tool';
import { MODE_LABELS } from '../../tools/route-planner.tool';

// ---- constants ----

const ROUTE_SRC = 'palm-route-src';
const ROUTE_LYR = 'palm-route-lyr';
const ROUTE_PT_SRC = 'palm-route-pt-src';
const ROUTE_PT_LYR = 'palm-route-pt-lyr';
const ISO_SRC = 'palm-isochrone-src';
const ISO_LYR = 'palm-isochrone-lyr';
const ISO_FILL_LYR = 'palm-isochrone-fill-lyr';

const ISO_COLORS = ['#2ecc71', '#27ae60', '#f39c12', '#e67e22', '#e74c3c'];
const ISO_OPACITIES = [0.2, 0.18, 0.15, 0.12, 0.1];

interface RoutePlannerPanelProps {
  tool: RoutePlannerTool;
}

// ---- Component ----

export function RoutePlannerPanel({ tool }: RoutePlannerPanelProps) {
  const [mode, setMode] = useState<RoutePlannerMode>(tool.state.mode);
  const [travelMode, setTravelMode] = useState<TravelMode>(tool.state.travelMode);
  const [status, setStatus] = useState<'idle' | 'computing' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(tool.state.routeResult);

  // 直接用 tool.state 读最新点位置，不存本地 state
  const [, setRenderTick] = useState(0);
  const forceRender = useCallback(() => setRenderTick((t) => t + 1), []);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const computingRef = useRef(false);

  // ---- sync tool → local ----
  useEffect(() => {
    const onStateChange = () => {
      setMode(tool.state.mode);
      setTravelMode(tool.state.travelMode);
      setRouteResult(tool.state.routeResult);
      forceRender();
    };
    tool.setOnStateChange(onStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool, forceRender]);

  // 本地读最新 tool 状态（避免闭包过期）
  const getStart = useCallback(() => tool.state.start, [tool]);
  const getEnd = useCallback(() => tool.state.end, [tool]);
  const getCenter = useCallback(() => tool.state.isochroneCenter, [tool]);

  // ---- mount ----
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map;
    mapRef.current = map;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const pt: LngLat = [e.lngLat.lng, e.lngLat.lat];
      const currentMode = tool.state.mode;

      if (currentMode === 'route') {
        const s = tool.state.start;
        const e = tool.state.end;

        if (!s) {
          // 第一次点击：设置起点
          tool.setStart(pt);
          drawMarkersForTool(map, tool);
        } else if (!e) {
          // 第二次点击：设置终点 + 自动计算
          tool.setEnd(pt);
          drawMarkersForTool(map, tool);
          // 延迟一帧确保 marker 先渲染
          requestAnimationFrame(() => {
            computeRouteInternal(pt);
          });
        }
      } else if (currentMode === 'isochrone') {
        tool.setIsochroneCenter(pt);
        drawCenterMarker(map, pt);
        requestAnimationFrame(() => {
          computeIsochroneInternal(pt);
        });
      }
    };

    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
      cleanupAll(map);
    };
    // 只在挂载时注册，通过 tool.state 读最新值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 路径计算 ----
  async function computeRouteInternal(_endPt?: LngLat) {
    const s = tool.state.start;
    const e = tool.state.end;
    if (!s || !e) return;

    const map = mapRef.current;
    if (!map) return;
    if (computingRef.current) return;
    computingRef.current = true;

    setStatus('computing');
    setError(null);

    try {
      const modeStr = tool.state.travelMode;
      const dist = haversineDistanceM(s[0], s[1], e[0], e[1]);

      // 沿途采样 DEM
      const sampleCount = Math.min(100, Math.max(4, Math.ceil(dist / 150)));
      const samplePoints: LngLat[] = [];
      for (let i = 0; i < sampleCount; i++) {
        const t = i / (sampleCount - 1);
        samplePoints.push([s[0] + (e[0] - s[0]) * t, s[1] + (e[1] - s[1]) * t]);
      }

      const elevations = await queryElevations(samplePoints, { resolutionMeters: 90 });

      const queryElev = (lng: number, lat: number) => {
        let best = elevations[0];
        let bestD = Infinity;
        for (let i = 0; i < samplePoints.length; i++) {
          const d = haversineDistanceM(lng, lat, samplePoints[i]![0], samplePoints[i]![1]);
          if (d < bestD) {
            bestD = d;
            best = elevations[i];
          }
        }
        return best ?? null;
      };

      const result = directPath(s, e, modeStr, queryElev);

      tool.setRouteResult(result);
      renderRoute(map, result);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : '计算失败');
      setStatus('error');
    } finally {
      computingRef.current = false;
    }
  }

  // ---- 等时线计算（降级：基于 DEM 格网 + 同心圆） ----
  async function computeIsochroneInternal(center: LngLat) {
    const map = mapRef.current;
    if (!map) return;

    setStatus('computing');
    setError(null);

    try {
      const speedKmh = MODE_SPEEDS[tool.state.travelMode];
      const thresholds = tool.state.isochroneThresholds; // [5, 10, 20, 30, 60] min

      // 最大半径 = 最快时间 × 速度 → 转换成度数
      const maxTimeMin = thresholds[thresholds.length - 1]!;
      const maxDistKm = (speedKmh * maxTimeMin) / 60;
      const maxDeg = maxDistKm / 111.32;

      // 在圆心周围采样 DEM 格网 30×30
      const gridSize = 30;
      const dDeg = (maxDeg * 2) / (gridSize - 1);

      const points: LngLat[] = [];
      const gridElev: (number | null)[][] = [];
      for (let r = 0; r < gridSize; r++) {
        gridElev[r] = [];
        for (let c = 0; c < gridSize; c++) {
          const lng = center[0] - maxDeg + c * dDeg;
          const lat = center[1] - maxDeg + r * dDeg;
          points.push([lng, lat]);
          gridElev[r]![c] = null;
        }
      }

      const elevations = await queryElevations(points, { resolutionMeters: 90 });

      // 填充格网
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          gridElev[r]![c] = elevations[r * gridSize + c];
        }
      }

      // 获取中心高程
      const centerIdx = Math.floor(gridSize / 2);
      const centerEle = gridElev[centerIdx]?.[centerIdx] ?? 0;

      // 为每个阈值生成等时圈
      const allContours: Array<{ timeMin: number; polygon: GeoJSON.Polygon }> = [];

      for (const timeMin of thresholds) {
        const budgetKm = (speedKmh * timeMin) / 60;
        const budgetDeg = budgetKm / 111.32;

        // 生成多边形：对每个方位角，计算最大可达距离
        const numAngles = 64;
        const ringCoords: [number, number][] = [];

        for (let ai = 0; ai < numAngles; ai++) {
          const angleRad = (ai / numAngles) * 2 * Math.PI;
          const cosA = Math.cos(angleRad);
          const sinA = Math.sin(angleRad);

          // 沿该方向向外搜索
          let maxReachDeg = 0;
          const steps = 20;
          for (let s = 1; s <= steps; s++) {
            const testDeg = (s / steps) * budgetDeg;
            const testLng = center[0] + testDeg * cosA;
            const testLat = center[1] + testDeg * sinA;

            // 查 DEM 格网
            const col = ((testLng - (center[0] - maxDeg)) / (2 * maxDeg)) * (gridSize - 1);
            const row = ((center[1] + maxDeg - testLat) / (2 * maxDeg)) * (gridSize - 1);
            const ci = Math.round(col);
            const ri = Math.round(row);

            let eleHere: number | null = null;
            if (ri >= 0 && ri < gridSize && ci >= 0 && ci < gridSize) {
              eleHere = gridElev[ri]![ci]!;
            }

            // 高程惩罚：上坡减可达距离
            let effectiveDist = testDeg * 111.32; // km
            if (eleHere !== null && centerEle !== null) {
              const dEle = eleHere - centerEle;
              if (dEle > 0) {
                // 上坡：每爬升 100m 等效多走 1km
                effectiveDist += dEle / 100;
              }
            }

            if (effectiveDist <= budgetKm) {
              maxReachDeg = testDeg;
            } else {
              break;
            }
          }

          const finalLng = center[0] + maxReachDeg * cosA;
          const finalLat = center[1] + maxReachDeg * sinA;
          ringCoords.push([finalLng, finalLat]);
        }

        // 闭合
        ringCoords.push(ringCoords[0]!);

        allContours.push({
          timeMin,
          polygon: {
            type: 'Polygon',
            coordinates: [ringCoords],
          },
        });
      }

      // 存储 + 渲染
      tool.setIsochroneResult(allContours);
      renderIsochrones(map, allContours);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : '等时线生成失败');
      setStatus('error');
    }
  }

  // ---- 手动计算按钮（已设起点终点但还没计算时） ----
  function handleManualCompute() {
    computeRouteInternal();
  }

  function handleModeChange(nextMode: RoutePlannerMode) {
    tool.setMode(nextMode);
    setStatus('idle');
    setError(null);
    const map = mapRef.current;
    if (!map) return;
    cleanupAll(map);
    if (nextMode === 'route') drawMarkersForTool(map, tool);
    else if (tool.state.isochroneCenter) drawCenterMarker(map, tool.state.isochroneCenter);
  }

  function handleClearRoutePoint(kind: 'start' | 'end') {
    if (kind === 'start') tool.setStart(null);
    else tool.setEnd(null);
    const map = mapRef.current;
    if (map) {
      cleanupRoute(map);
      drawMarkersForTool(map, tool);
    }
    setRouteResult(null);
    setStatus('idle');
    setError(null);
  }

  function handleClearCenter() {
    tool.setIsochroneCenter(null);
    const map = mapRef.current;
    if (map) cleanupAll(map);
    setStatus('idle');
    setError(null);
  }

  // ---- 重置 ----
  function handleReset() {
    computingRef.current = false;
    tool.reset();
    const map = mapRef.current;
    if (map) cleanupAll(map);
    setStatus('idle');
    setError(null);
  }

  // ---- 难度标签 ----
  const diffLabel: Record<string, string> = {
    easy: '轻松',
    moderate: '中等',
    hard: '挑战',
    extreme: '极限',
  };
  const diffColor: Record<string, string> = {
    easy: '#2ecc71',
    moderate: '#f39c12',
    hard: '#e67e22',
    extreme: '#e74c3c',
  };

  const start = getStart();
  const end = getEnd();
  const center = getCenter();

  // ============ JSX ============

  return (
    <div className="pw-panel-stack">
      {/* 模式切换 */}
      <div className="pw-segmented">
        {(Object.entries(MODE_LABELS) as [RoutePlannerMode, string][]).map(([m, label]) => (
          <button
            key={m}
            type="button"
            className={mode === m ? 'is-active' : ''}
            onClick={() => handleModeChange(m)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 出行方式 */}
      <div className="pw-segmented">
        {(
          [
            ['walking', '步行', Footprints],
            ['cycling', '骑行', Bike],
            ['driving', '驾车', Car],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            className={travelMode === m ? 'is-active' : ''}
            onClick={() => tool.setTravelMode(m)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* 路径模式 */}
      {mode === 'route' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <MapPin size={14} color="#2ecc71" />
              <span style={{ flex: 1, color: start ? 'var(--pw-text)' : 'var(--pw-text-muted)' }}>
                {start ? `${start[0].toFixed(4)}, ${start[1].toFixed(4)}` : '点击地图设置起点'}
              </span>
              {start && (
                <button
                  type="button"
                  onClick={() => handleClearRoutePoint('start')}
                  title="清除起点"
                  aria-label="清除起点"
                  style={{
                    padding: '1px 4px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--pw-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <Flag size={14} color="#e74c3c" />
              <span style={{ flex: 1, color: end ? 'var(--pw-text)' : 'var(--pw-text-muted)' }}>
                {end ? `${end[0].toFixed(4)}, ${end[1].toFixed(4)}` : '点击地图设置终点'}
              </span>
              {end && (
                <button
                  type="button"
                  onClick={() => handleClearRoutePoint('end')}
                  title="清除终点"
                  aria-label="清除终点"
                  style={{
                    padding: '1px 4px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--pw-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {start && end && status === 'idle' && (
            <button
              type="button"
              className="pw-primary-button"
              onClick={handleManualCompute}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Route size={14} />
              计算路径
            </button>
          )}
        </>
      )}

      {/* 等时线模式 */}
      {mode === 'isochrone' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <Clock size={14} color="#3498db" />
          <span style={{ flex: 1, color: center ? 'var(--pw-text)' : 'var(--pw-text-muted)' }}>
            {center ? `${center[0].toFixed(4)}, ${center[1].toFixed(4)}` : '点击地图设置中心点'}
          </span>
          {center && (
            <button
              type="button"
              onClick={handleClearCenter}
              title="清除中心点"
              aria-label="清除中心点"
              style={{
                padding: '1px 4px',
                border: 'none',
                background: 'transparent',
                color: 'var(--pw-text-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* 状态 */}
      {status === 'computing' && (
        <div className="pw-panel-status is-warning">
          <LoaderCircle size={14} style={{ animation: 'spin 1s linear infinite' }} />
          <span>计算中...</span>
        </div>
      )}
      {status === 'error' && error && (
        <div className="pw-panel-status is-danger">
          <span>{error}</span>
        </div>
      )}

      {/* 路径结果 */}
      {status === 'ready' && routeResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <StatBox label="总距离" value={`${routeResult.totalDistanceKm.toFixed(1)} km`} />
            <StatBox label="用时" value={`${routeResult.totalDurationMin.toFixed(0)} min`} />
            <StatBox
              label="累计爬升"
              value={`${routeResult.totalClimbM.toFixed(0)} m`}
              color="#e74c3c"
            />
            <StatBox
              label="累计下降"
              value={`${routeResult.totalDescentM.toFixed(0)} m`}
              color="#3498db"
            />
          </div>
          <div
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              background: `${diffColor[routeResult.difficulty]}22`,
              color: diffColor[routeResult.difficulty],
              textAlign: 'center',
            }}
          >
            {diffLabel[routeResult.difficulty]}
          </div>
        </div>
      )}

      {/* 等时线图例 */}
      {status === 'ready' && mode === 'isochrone' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, color: 'var(--pw-text-muted)' }}>
            可达范围（基于 DEM 高程修正）
          </label>
          {tool.state.isochroneThresholds.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: ISO_COLORS[i % ISO_COLORS.length],
                  flexShrink: 0,
                }}
              />
              <span style={{ color: 'var(--pw-text)' }}>{t} 分钟内可达</span>
            </div>
          ))}
        </div>
      )}

      {/* 操作 */}
      <button
        type="button"
        className="pw-secondary-button"
        onClick={handleReset}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginTop: 8,
        }}
      >
        <RotateCcw size={14} />
        重置
      </button>
    </div>
  );
}

// ---- 地图渲染 helpers（marker 立即渲染） ----

function drawMarkersForTool(map: maplibregl.Map, tool: RoutePlannerTool) {
  const s = tool.state.start;
  const e = tool.state.end;
  const features: GeoJSON.Feature[] = [];
  if (s)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: s },
      properties: { type: 'start' },
    });
  if (e)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: e },
      properties: { type: 'end' },
    });

  const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };

  const src = map.getSource(ROUTE_PT_SRC) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(geojson);
  } else if (features.length > 0) {
    map.addSource(ROUTE_PT_SRC, { type: 'geojson', data: geojson });
    // 需要确保 source 存在后再加 layer
    map.addLayer({
      id: ROUTE_PT_LYR,
      source: ROUTE_PT_SRC,
      type: 'circle',
      paint: {
        'circle-radius': ['match', ['get', 'type'], 'start', 7, 'end', 7, 6],
        'circle-color': ['match', ['get', 'type'], 'start', '#2ecc71', 'end', '#e74c3c', '#3498db'],
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 2,
      },
    });
  }
}

function drawCenterMarker(map: maplibregl.Map, pt: LngLat) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: pt }, properties: {} }],
  };

  // 复用 point source
  cleanupRoute(map);
  const src = map.getSource(ROUTE_PT_SRC) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(geojson);
  } else {
    map.addSource(ROUTE_PT_SRC, { type: 'geojson', data: geojson });
    map.addLayer({
      id: ROUTE_PT_LYR,
      source: ROUTE_PT_SRC,
      type: 'circle',
      paint: {
        'circle-radius': 8,
        'circle-color': '#3498db',
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 2,
      },
    });
  }
}

function renderRoute(map: maplibregl.Map, result: RouteResult) {
  cleanupRoute(map);

  const geojson: GeoJSON.Feature = {
    type: 'Feature',
    geometry: result.path,
    properties: {},
  };

  map.addSource(ROUTE_SRC, { type: 'geojson', data: geojson });
  map.addLayer({
    id: ROUTE_LYR,
    source: ROUTE_SRC,
    type: 'line',
    paint: {
      'line-color': '#3498db',
      'line-width': 4,
      'line-opacity': 0.9,
    },
  });

  // 起终点标记（用 result 的实际首尾坐标确保精确）
  const coords = result.path.coordinates;
  const ptGeojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords[0]! },
        properties: { type: 'start' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords[coords.length - 1]! },
        properties: { type: 'end' },
      },
    ],
  };

  const ptSrc = map.getSource(ROUTE_PT_SRC) as maplibregl.GeoJSONSource | undefined;
  if (ptSrc) {
    ptSrc.setData(ptGeojson);
  } else {
    map.addSource(ROUTE_PT_SRC, { type: 'geojson', data: ptGeojson });
    map.addLayer({
      id: ROUTE_PT_LYR,
      source: ROUTE_PT_SRC,
      type: 'circle',
      paint: {
        'circle-radius': ['match', ['get', 'type'], 'start', 8, 'end', 8, 6],
        'circle-color': ['match', ['get', 'type'], 'start', '#2ecc71', 'end', '#e74c3c', '#3498db'],
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 2,
      },
    });
  }
}

function renderIsochrones(
  map: maplibregl.Map,
  contours: Array<{ timeMin: number; polygon: GeoJSON.Polygon }>,
) {
  cleanupIsochrone(map);

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: contours.map((c, i) => ({
      type: 'Feature' as const,
      geometry: c.polygon,
      properties: { timeMin: c.timeMin, idx: i },
    })),
  };

  map.addSource(ISO_SRC, { type: 'geojson', data: geojson });

  map.addLayer({
    id: ISO_FILL_LYR,
    source: ISO_SRC,
    type: 'fill',
    paint: {
      'fill-color': [
        'match',
        ['get', 'idx'],
        0,
        ISO_COLORS[0]!,
        1,
        ISO_COLORS[1]!,
        2,
        ISO_COLORS[2]!,
        3,
        ISO_COLORS[3]!,
        ISO_COLORS[4]!,
      ],
      'fill-opacity': [
        'match',
        ['get', 'idx'],
        0,
        ISO_OPACITIES[0]!,
        1,
        ISO_OPACITIES[1]!,
        2,
        ISO_OPACITIES[2]!,
        3,
        ISO_OPACITIES[3]!,
        ISO_OPACITIES[4]!,
      ],
    },
  });

  map.addLayer({
    id: ISO_LYR,
    source: ISO_SRC,
    type: 'line',
    paint: {
      'line-color': [
        'match',
        ['get', 'idx'],
        0,
        ISO_COLORS[0]!,
        1,
        ISO_COLORS[1]!,
        2,
        ISO_COLORS[2]!,
        3,
        ISO_COLORS[3]!,
        ISO_COLORS[4]!,
      ],
      'line-width': 1.5,
      'line-opacity': 0.7,
    },
  });
}

function cleanupRoute(map: maplibregl.Map) {
  for (const id of [ROUTE_LYR])
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* */
    }
  for (const id of [ROUTE_SRC])
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch {
      /* */
    }
}

function cleanupIsochrone(map: maplibregl.Map) {
  for (const id of [ISO_FILL_LYR, ISO_LYR])
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* */
    }
  for (const id of [ISO_SRC])
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch {
      /* */
    }
}

function cleanupAll(map: maplibregl.Map) {
  for (const id of [ROUTE_LYR, ROUTE_PT_LYR, ISO_FILL_LYR, ISO_LYR])
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* */
    }
  for (const id of [ROUTE_SRC, ROUTE_PT_SRC, ISO_SRC])
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch {
      /* */
    }
}

// ---- 小型统计组件 ----

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        padding: '6px 10px',
        borderRadius: 4,
        background: '#0d1217',
        border: '1px solid var(--pw-border)',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--pw-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color ?? 'var(--pw-text)' }}>{value}</div>
    </div>
  );
}
