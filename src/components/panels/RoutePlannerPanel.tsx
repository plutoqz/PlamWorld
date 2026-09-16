// components/panels/RoutePlannerPanel.tsx — 路径规划面板 (v0.6)
//
// 功能与交互：
//   1. 路径模式：
//      - 点击起点 → 渲染起点标记「起」
//      - 点击终点 → 自动计算 → 渲染路径线与数据仪表盘
//      - 严格区分人/车路网（OSM 专有步行小径 vs 机动车道路）
//      - 多候选路径方案比对（推荐·走大路 / 近道·距离更短 / 少路口·红绿灯少 / 平缓等）
//      - 点击面板卡片或地图灰色备选路线一键切换
//      - 添加中转点（点击「+ 添加中转点」或在起终点已有时直接点击地图）→ 渲染标号「1」「2」...
//      - 切换出行方式（步行/骑行/驾车）→ 自动即时重新计算路径与仪表盘数据
//      - 删除/清空中转点 → 即时重新规划
//   2. 等时线模式：
//      - 点击中心点 → 基于 DEM 格网生成等时圈
//      - 切换出行方式 → 自动重新根据速度计算可达圈层

import { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  Clock,
  Footprints,
  Bike,
  Car,
  LoaderCircle,
  RotateCcw,
  Route,
  X,
  Plus,
  Trash2,
} from 'lucide-react';
import type { LngLat } from '../../core/types';
import { directPath, fetchOSRMAlternativeRoutes, haversineDistanceM } from '../../core/pathfinding';
import type { TravelMode, RouteResult } from '../../core/pathfinding';
import { MODE_SPEEDS } from '../../core/pathfinding';
import { queryElevations } from '../../engines/elevation-api';
import type { RoutePlannerTool, RoutePlannerMode } from '../../tools/route-planner.tool';
import { MODE_LABELS } from '../../tools/route-planner.tool';

// ---- constants ----

const ROUTE_SRC = 'palm-route-src';
const ROUTE_LYR = 'palm-route-lyr';
const ROUTE_ALT_SRC = 'palm-route-alt-src';
const ROUTE_ALT_LYR = 'palm-route-alt-lyr';

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
  const [routes, setRoutes] = useState<RouteResult[]>(tool.state.routes);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(tool.state.selectedRouteIndex);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);

  const [, setRenderTick] = useState(0);
  const forceRender = useCallback(() => setRenderTick((t) => t + 1), []);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const computingRef = useRef(false);
  const isAddingWaypointRef = useRef(false);
  isAddingWaypointRef.current = isAddingWaypoint;

  // DOM 标记管理（起、中转点1/2/3...、终点、中心点）
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // ---- sync tool → local ----
  useEffect(() => {
    const onStateChange = () => {
      setMode(tool.state.mode);
      setTravelMode(tool.state.travelMode);
      setRouteResult(tool.state.routeResult);
      setRoutes(tool.state.routes);
      setSelectedRouteIndex(tool.state.selectedRouteIndex);
      forceRender();
    };
    tool.setOnStateChange(onStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool, forceRender]);

  const getStart = useCallback(() => tool.state.start, [tool]);
  const getEnd = useCallback(() => tool.state.end, [tool]);
  const getCenter = useCallback(() => tool.state.isochroneCenter, [tool]);

  // ---- 切换选中的路线方案 ----
  function handleSelectRoute(index: number) {
    tool.selectRoute(index);
    setSelectedRouteIndex(index);
    setRouteResult(tool.state.routes[index] ?? null);
    const map = mapRef.current;
    if (map && tool.state.routes.length > 0) {
      renderAllRoutes(map, tool.state.routes, index);
    }
  }

  // ---- mount ----
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map;
    mapRef.current = map;

    // 初始渲染标记与已有路线
    if (tool.state.mode === 'route') {
      updateMarkers(map, tool, markersRef);
      if (tool.state.routes.length > 0) {
        renderAllRoutes(map, tool.state.routes, tool.state.selectedRouteIndex);
      } else if (tool.state.routeResult) {
        renderAllRoutes(map, [tool.state.routeResult], 0);
      }
    } else if (tool.state.isochroneCenter) {
      updateCenterMarker(map, tool.state.isochroneCenter, markersRef);
    }

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const pt: LngLat = [e.lngLat.lng, e.lngLat.lat];
      const currentMode = tool.state.mode;

      if (currentMode === 'route') {
        // 优先检测是否点击了地图上的备选路线
        if (map.getLayer(ROUTE_ALT_LYR)) {
          const features = map.queryRenderedFeatures(e.point, { layers: [ROUTE_ALT_LYR] });
          if (features.length > 0) {
            const clickedIdx = features[0]?.properties?.routeIdx;
            if (clickedIdx !== undefined && clickedIdx !== null) {
              const idx = Number(clickedIdx);
              if (idx >= 0 && idx < tool.state.routes.length) {
                handleSelectRoute(idx);
                return;
              }
            }
          }
        }

        const s = tool.state.start;
        const end = tool.state.end;

        if (!s) {
          // 第 1 次点击：设置起点
          tool.setStart(pt);
          updateMarkers(map, tool, markersRef);
        } else if (!end) {
          // 第 2 次点击：设置终点并自动计算
          tool.setEnd(pt);
          updateMarkers(map, tool, markersRef);
          requestAnimationFrame(() => {
            computeRouteInternal();
          });
        } else {
          // 已经有起点和终点：添加途经中转点并即时重算
          tool.addWaypoint(pt);
          if (isAddingWaypointRef.current) {
            setIsAddingWaypoint(false);
            isAddingWaypointRef.current = false;
          }
          updateMarkers(map, tool, markersRef);
          requestAnimationFrame(() => {
            computeRouteInternal();
          });
        }
      } else if (currentMode === 'isochrone') {
        tool.setIsochroneCenter(pt);
        updateCenterMarker(map, pt, markersRef);
        requestAnimationFrame(() => {
          computeIsochroneInternal(pt);
        });
      }
    };

    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
      cleanupAll(map);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 路径计算（支持人/车路网隔离、山间步道与多路线候选方案） ----
  async function computeRouteInternal(activeTravelMode?: TravelMode) {
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
      const modeStr = activeTravelMode ?? tool.state.travelMode;
      const waypoints = tool.state.waypoints;
      const allPoints: [number, number][] = [s, ...waypoints, e];

      // 1. 请求专有服务获取多条候选路线（走大路、近道、少路口等）
      let candidateRoutes = await fetchOSRMAlternativeRoutes(allPoints, modeStr);

      if (candidateRoutes && candidateRoutes.length > 0) {
        // 对每条候选路线采样高程
        for (const route of candidateRoutes) {
          const coords = route.path.coordinates as [number, number][];
          const stride = Math.max(1, Math.floor(coords.length / 80));
          const samplePoints: LngLat[] = [];
          for (let i = 0; i < coords.length; i += stride) {
            samplePoints.push(coords[i]!);
          }
          if (samplePoints[samplePoints.length - 1] !== coords[coords.length - 1]) {
            samplePoints.push(coords[coords.length - 1]!);
          }

          try {
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

            route.waypoints.forEach((wp) => {
              wp.ele = queryElev(wp.lng, wp.lat);
            });
            let totalClimbM = 0;
            let totalDescentM = 0;
            route.segments.forEach((seg, i) => {
              const fromEle = route.waypoints[i]?.ele ?? 0;
              const toEle = route.waypoints[i + 1]?.ele ?? 0;
              const dEle = toEle - fromEle;
              seg.climbM = dEle > 0 ? dEle : 0;
              seg.descentM = dEle < 0 ? Math.abs(dEle) : 0;
              if (dEle > 0) totalClimbM += dEle;
              else totalDescentM += Math.abs(dEle);
            });
            route.totalClimbM = totalClimbM;
            route.totalDescentM = totalDescentM;
            if (totalClimbM > 2000 || route.totalDistanceKm > 50) route.difficulty = 'extreme';
            else if (totalClimbM > 1000 || route.totalDistanceKm > 30) route.difficulty = 'hard';
            else if (totalClimbM > 400 || route.totalDistanceKm > 15) route.difficulty = 'moderate';
          } catch {
            // Elevation sampling error doesn't block route display
          }
        }
      } else {
        // 2. 离线/服务失败时的降级方案
        const samplePoints: LngLat[] = [];
        for (let sIdx = 0; sIdx < allPoints.length - 1; sIdx++) {
          const p1 = allPoints[sIdx]!;
          const p2 = allPoints[sIdx + 1]!;
          const legDist = haversineDistanceM(p1[0], p1[1], p2[0], p2[1]);
          const legSampleCount = Math.min(50, Math.max(3, Math.ceil(legDist / 150)));
          for (let i = (sIdx === 0 ? 0 : 1); i < legSampleCount; i++) {
            const t = i / (legSampleCount - 1);
            samplePoints.push([p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t]);
          }
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

        const directRes = directPath(allPoints, modeStr, queryElev);
        directRes.label = '📐 直线高程测距';
        directRes.labelDesc = '网络离线降级方案';
        candidateRoutes = [directRes];
      }

      tool.setRoutes(candidateRoutes, 0);
      setRoutes(candidateRoutes);
      setSelectedRouteIndex(0);
      setRouteResult(candidateRoutes[0] ?? null);
      renderAllRoutes(map, candidateRoutes, 0);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : '计算失败');
      setStatus('error');
    } finally {
      computingRef.current = false;
    }
  }

  // ---- 等时线计算（基于 DEM 格网 + 同心圆修正） ----
  async function computeIsochroneInternal(center: LngLat, activeTravelMode?: TravelMode) {
    const map = mapRef.current;
    if (!map) return;

    setStatus('computing');
    setError(null);

    try {
      const travelM = activeTravelMode ?? tool.state.travelMode;
      const speedKmh = MODE_SPEEDS[travelM];
      const thresholds = tool.state.isochroneThresholds; // [5, 10, 20, 30, 60] min

      const maxTimeMin = thresholds[thresholds.length - 1]!;
      const maxDistKm = (speedKmh * maxTimeMin) / 60;
      const maxDeg = maxDistKm / 111.32;

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

      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          gridElev[r]![c] = elevations[r * gridSize + c];
        }
      }

      const centerIdx = Math.floor(gridSize / 2);
      const centerEle = gridElev[centerIdx]?.[centerIdx] ?? 0;

      const allContours: Array<{ timeMin: number; polygon: GeoJSON.Polygon }> = [];

      for (const timeMin of thresholds) {
        const budgetKm = (speedKmh * timeMin) / 60;
        const budgetDeg = budgetKm / 111.32;

        const numAngles = 64;
        const ringCoords: [number, number][] = [];

        for (let ai = 0; ai < numAngles; ai++) {
          const angleRad = (ai / numAngles) * 2 * Math.PI;
          const cosA = Math.cos(angleRad);
          const sinA = Math.sin(angleRad);

          let maxReachDeg = 0;
          const steps = 20;
          for (let s = 1; s <= steps; s++) {
            const testDeg = (s / steps) * budgetDeg;
            const testLng = center[0] + testDeg * cosA;
            const testLat = center[1] + testDeg * sinA;

            const col = ((testLng - (center[0] - maxDeg)) / (2 * maxDeg)) * (gridSize - 1);
            const row = ((center[1] + maxDeg - testLat) / (2 * maxDeg)) * (gridSize - 1);
            const ci = Math.round(col);
            const ri = Math.round(row);

            let eleHere: number | null = null;
            if (ri >= 0 && ri < gridSize && ci >= 0 && ci < gridSize) {
              eleHere = gridElev[ri]![ci]!;
            }

            let effectiveDist = testDeg * 111.32;
            if (eleHere !== null && centerEle !== null) {
              const dEle = eleHere - centerEle;
              if (dEle > 0) {
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

        ringCoords.push(ringCoords[0]!);

        allContours.push({
          timeMin,
          polygon: {
            type: 'Polygon',
            coordinates: [ringCoords],
          },
        });
      }

      tool.setIsochroneResult(allContours);
      renderIsochrones(map, allContours);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : '等时线生成失败');
      setStatus('error');
    }
  }

  // ---- 模式与出行方式切换即时重算 ----
  function handleModeChange(nextMode: RoutePlannerMode) {
    tool.setMode(nextMode);
    setStatus('idle');
    setError(null);
    setIsAddingWaypoint(false);
    isAddingWaypointRef.current = false;
    const map = mapRef.current;
    if (!map) return;
    cleanupAll(map);
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (nextMode === 'route') {
      updateMarkers(map, tool, markersRef);
      if (tool.state.routes.length > 0) {
        renderAllRoutes(map, tool.state.routes, tool.state.selectedRouteIndex);
      } else if (tool.state.routeResult) {
        renderAllRoutes(map, [tool.state.routeResult], 0);
      }
    } else if (tool.state.isochroneCenter) {
      updateCenterMarker(map, tool.state.isochroneCenter, markersRef);
      if (tool.state.isochroneResult) {
        renderIsochrones(map, tool.state.isochroneResult);
      }
    }
  }

  function handleTravelModeChange(nextMode: TravelMode) {
    tool.setTravelMode(nextMode);
    setTravelMode(nextMode);

    if (tool.state.mode === 'route') {
      if (tool.state.start && tool.state.end) {
        requestAnimationFrame(() => {
          computeRouteInternal(nextMode);
        });
      }
    } else if (tool.state.mode === 'isochrone') {
      if (tool.state.isochroneCenter) {
        requestAnimationFrame(() => {
          computeIsochroneInternal(tool.state.isochroneCenter!, nextMode);
        });
      }
    }
  }

  function handleClearRoutePoint(kind: 'start' | 'end') {
    if (kind === 'start') tool.setStart(null);
    else tool.setEnd(null);
    const map = mapRef.current;
    if (map) {
      cleanupRoute(map);
      updateMarkers(map, tool, markersRef);
    }
    setRouteResult(null);
    setRoutes([]);
    setStatus('idle');
    setError(null);
  }

  function handleRemoveWaypoint(index: number) {
    tool.removeWaypoint(index);
    forceRender();
    const map = mapRef.current;
    if (map) {
      updateMarkers(map, tool, markersRef);
      if (tool.state.start && tool.state.end) {
        requestAnimationFrame(() => {
          computeRouteInternal();
        });
      } else {
        cleanupRoute(map);
        setRouteResult(null);
        setRoutes([]);
      }
    }
  }

  function handleClearWaypoints() {
    tool.clearWaypoints();
    forceRender();
    const map = mapRef.current;
    if (map) {
      updateMarkers(map, tool, markersRef);
      if (tool.state.start && tool.state.end) {
        requestAnimationFrame(() => {
          computeRouteInternal();
        });
      }
    }
  }

  function handleClearCenter() {
    tool.setIsochroneCenter(null);
    const map = mapRef.current;
    if (map) {
      cleanupAll(map);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    }
    setStatus('idle');
    setError(null);
  }

  function handleReset() {
    computingRef.current = false;
    setIsAddingWaypoint(false);
    isAddingWaypointRef.current = false;
    tool.reset();
    const map = mapRef.current;
    if (map) {
      cleanupAll(map);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    }
    setRoutes([]);
    setSelectedRouteIndex(0);
    setStatus('idle');
    setError(null);
  }

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
  const waypoints = tool.state.waypoints;

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

      {/* 出行方式（点击即时触发路径或等时线重算） */}
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
            onClick={() => handleTravelModeChange(m)}
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
            {/* 起点 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#22c55e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: '#fff',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                起
              </div>
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

            {/* 途经中转点列表 */}
            {waypoints.map((wp, idx) => (
              <div
                key={`wp-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  paddingLeft: 4,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    color: '#fff',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </div>
                <span style={{ flex: 1, color: 'var(--pw-text)' }}>
                  {`${wp[0].toFixed(4)}, ${wp[1].toFixed(4)}`}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveWaypoint(idx)}
                  title={`删除途经点 ${idx + 1}`}
                  aria-label={`删除途经点 ${idx + 1}`}
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
              </div>
            ))}

            {/* 终点 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: '#fff',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                终
              </div>
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

          {/* 中转点操作栏 */}
          {start && end && (
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button
                type="button"
                className={`pw-secondary-button ${isAddingWaypoint ? 'is-active' : ''}`}
                onClick={() => {
                  setIsAddingWaypoint((prev) => {
                    isAddingWaypointRef.current = !prev;
                    return !prev;
                  });
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  fontSize: 12,
                  borderColor: isAddingWaypoint ? '#f59e0b' : undefined,
                  color: isAddingWaypoint ? '#f59e0b' : undefined,
                }}
              >
                <Plus size={13} />
                {isAddingWaypoint ? '正在添加：点击地图选点' : '+ 添加中转点'}
              </button>

              {waypoints.length > 0 && (
                <button
                  type="button"
                  className="pw-secondary-button"
                  onClick={handleClearWaypoints}
                  title="清空全部中转点"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    fontSize: 12,
                    padding: '0 8px',
                  }}
                >
                  <Trash2 size={13} />
                  清空
                </button>
              )}
            </div>
          )}

          {isAddingWaypoint && (
            <div style={{ fontSize: 11, color: '#f59e0b', textAlign: 'center', marginTop: 2 }}>
              💡 请在地图上单击任意位置添加途经中转点
            </div>
          )}

          {start && end && status === 'idle' && (
            <button
              type="button"
              className="pw-primary-button"
              onClick={() => computeRouteInternal()}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Route size={14} />
              重新计算路径
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

      {/* 计算状态 */}
      {status === 'computing' && (
        <div className="pw-panel-status is-warning">
          <LoaderCircle size={14} style={{ animation: 'spin 1s linear infinite' }} />
          <span>正在规划路线与比对方案...</span>
        </div>
      )}
      {status === 'error' && error && (
        <div className="pw-panel-status is-danger">
          <span>{error}</span>
        </div>
      )}

      {/* 多路线候选方案比对卡片 */}
      {status === 'ready' && routes.length > 1 && mode === 'route' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
          <div style={{ fontSize: 11, color: 'var(--pw-text-muted)', fontWeight: 600 }}>
            🧭 路线方案对比（点击卡片或地图切换）：
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {routes.map((r, idx) => {
              const isSelected = selectedRouteIndex === idx;
              return (
                <div
                  key={`route-opt-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectRoute(idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSelectRoute(idx);
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: isSelected ? 'rgba(59, 130, 246, 0.15)' : '#0d1217',
                    border: `1.5px solid ${isSelected ? '#3b82f6' : 'var(--pw-border)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: isSelected ? '#3b82f6' : '#94a3b8',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: isSelected ? '#3b82f6' : 'var(--pw-text)',
                        }}
                      >
                        {r.label ?? `路线 ${idx + 1}`}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: isSelected ? '#60a5fa' : 'var(--pw-text)',
                      }}
                    >
                      {r.totalDurationMin.toFixed(0)} min
                    </span>
                  </div>

                  {r.labelDesc && (
                    <div
                      style={{
                        fontSize: 11,
                        color: isSelected ? '#93c5fd' : 'var(--pw-text-muted)',
                        paddingLeft: 14,
                      }}
                    >
                      {r.labelDesc}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 11,
                      color: 'var(--pw-text-muted)',
                      paddingLeft: 14,
                      marginTop: 2,
                    }}
                  >
                    <span>{r.totalDistanceKm.toFixed(1)} km</span>
                    <span>爬升 {r.totalClimbM.toFixed(0)}m</span>
                    {r.intersectionCount !== undefined && r.intersectionCount > 0 && (
                      <span>{r.intersectionCount} 个路口</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 路径结果仪表盘 */}
      {status === 'ready' && routeResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
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
            难度评估：{diffLabel[routeResult.difficulty]}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'var(--pw-text-muted)',
              padding: '2px 4px',
            }}
          >
            <span>导航路网引擎</span>
            <span
              style={{
                color: routeResult.source === 'osrm' ? '#22c55e' : '#f59e0b',
                fontWeight: 600,
              }}
            >
              {routeResult.source === 'osrm'
                ? travelMode === 'walking'
                  ? '🚶 OSM 人行专有步道小径'
                  : travelMode === 'cycling'
                    ? '🚲 OSM 骑行绿道/适行网'
                    : '🚗 OSM 机动车道路网'
                : '📐 多点直线高程采样 (离线降级)'}
            </span>
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

      {/* 重置 */}
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
        重置规划
      </button>
    </div>
  );
}

// ---- 地图 DOM 标记与多方案线层渲染 helpers ----

function updateMarkers(
  map: maplibregl.Map,
  tool: RoutePlannerTool,
  markersRef: React.MutableRefObject<maplibregl.Marker[]>,
) {
  markersRef.current.forEach((m) => m.remove());
  markersRef.current = [];

  const s = tool.state.start;
  const waypoints = tool.state.waypoints;
  const e = tool.state.end;

  if (s) {
    const el = document.createElement('div');
    el.title = `起点: ${s[0].toFixed(4)}, ${s[1].toFixed(4)}`;
    el.innerHTML = `<div style="
      width: 22px; height: 22px; border-radius: 50%;
      background: #22c55e; border: 2.5px solid #ffffff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; color: #ffffff; font-weight: 800; user-select: none;
    ">起</div>`;
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(s).addTo(map);
    markersRef.current.push(marker);
  }

  waypoints.forEach((wp, idx) => {
    const el = document.createElement('div');
    el.title = `途经点 ${idx + 1}: ${wp[0].toFixed(4)}, ${wp[1].toFixed(4)}`;
    el.innerHTML = `<div style="
      width: 22px; height: 22px; border-radius: 50%;
      background: #f59e0b; border: 2.5px solid #ffffff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; color: #ffffff; font-weight: 800; user-select: none;
    ">${idx + 1}</div>`;
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(wp).addTo(map);
    markersRef.current.push(marker);
  });

  if (e) {
    const el = document.createElement('div');
    el.title = `终点: ${e[0].toFixed(4)}, ${e[1].toFixed(4)}`;
    el.innerHTML = `<div style="
      width: 22px; height: 22px; border-radius: 50%;
      background: #ef4444; border: 2.5px solid #ffffff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; color: #ffffff; font-weight: 800; user-select: none;
    ">终</div>`;
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(e).addTo(map);
    markersRef.current.push(marker);
  }
}

function updateCenterMarker(
  map: maplibregl.Map,
  pt: LngLat | null,
  markersRef: React.MutableRefObject<maplibregl.Marker[]>,
) {
  markersRef.current.forEach((m) => m.remove());
  markersRef.current = [];

  if (!pt) return;

  const el = document.createElement('div');
  el.title = `中心点: ${pt[0].toFixed(4)}, ${pt[1].toFixed(4)}`;
  el.innerHTML = `<div style="
    width: 22px; height: 22px; border-radius: 50%;
    background: #3b82f6; border: 2.5px solid #ffffff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; color: #ffffff; font-weight: 800; user-select: none;
  ">中</div>`;
  const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(pt).addTo(map);
  markersRef.current.push(marker);
}

function renderAllRoutes(
  map: maplibregl.Map,
  allRoutes: RouteResult[],
  selectedIdx: number,
) {
  cleanupRoute(map);
  if (allRoutes.length === 0) return;

  const validSelectedIdx = Math.max(0, Math.min(allRoutes.length - 1, selectedIdx));
  const activeRoute = allRoutes[validSelectedIdx]!;

  // 1. 渲染未选中的备选路线（在底层，灰色半透明）
  const altFeatures: GeoJSON.Feature[] = [];
  allRoutes.forEach((r, i) => {
    if (i !== validSelectedIdx) {
      altFeatures.push({
        type: 'Feature',
        geometry: r.path,
        properties: { routeIdx: i },
      });
    }
  });

  if (altFeatures.length > 0) {
    const altGeojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: altFeatures,
    };
    map.addSource(ROUTE_ALT_SRC, { type: 'geojson', data: altGeojson });
    map.addLayer({
      id: ROUTE_ALT_LYR,
      source: ROUTE_ALT_SRC,
      type: 'line',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#94a3b8',
        'line-width': 5,
        'line-opacity': 0.65,
      },
    });
  }

  // 2. 渲染选中的主路线（在顶层，高亮鲜亮蓝）
  const activeGeojson: GeoJSON.Feature = {
    type: 'Feature',
    geometry: activeRoute.path,
    properties: { routeIdx: validSelectedIdx },
  };

  map.addSource(ROUTE_SRC, { type: 'geojson', data: activeGeojson });
  map.addLayer({
    id: ROUTE_LYR,
    source: ROUTE_SRC,
    type: 'line',
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
    },
    paint: {
      'line-color': '#3b82f6',
      'line-width': 6,
      'line-opacity': 0.95,
    },
  });
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
  for (const id of [ROUTE_LYR, ROUTE_ALT_LYR]) {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* */
    }
  }
  for (const id of [ROUTE_SRC, ROUTE_ALT_SRC]) {
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch {
      /* */
    }
  }
}

function cleanupIsochrone(map: maplibregl.Map) {
  for (const id of [ISO_FILL_LYR, ISO_LYR]) {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* */
    }
  }
  for (const id of [ISO_SRC]) {
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch {
      /* */
    }
  }
}

function cleanupAll(map: maplibregl.Map) {
  for (const id of [ROUTE_LYR, ROUTE_ALT_LYR, ISO_FILL_LYR, ISO_LYR]) {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* */
    }
  }
  for (const id of [ROUTE_SRC, ROUTE_ALT_SRC, ISO_SRC]) {
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch {
      /* */
    }
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
