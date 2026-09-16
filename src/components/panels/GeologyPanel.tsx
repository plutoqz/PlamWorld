// components/panels/GeologyPanel.tsx — 地质剖面面板 (v0.6)
//
// Canvas 双板渲染：
//   上板 — 地表高程剖面（复用 elevation-profile 风格）
//   下板 — 地下岩层结构（彩色矩形条带）
//
// 数据源：Macrostrat API（在线）→ 降级为内置模拟数据

import { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { MousePointer2, LoaderCircle, RotateCcw, Database, AlertTriangle } from 'lucide-react';
import type { LngLat } from '../../core/types';
import {
  fetchGeoUnits,
  generateMockGeology,
  LITHOLOGY_COLORS,
  LITHOLOGY_LABELS,
  ERA_LABELS,
} from '../../core/geology';
import type { GeoUnit, GeoProfile, GeoProfilePoint } from '../../core/geology';
import { queryElevations } from '../../engines/elevation-api';
import { haversineDistanceM } from '../../core/pathfinding';
import type { GeologyProfileTool } from '../../tools/geology-profile.tool';

// ---- constants ----
const LINE_SRC = 'palm-geo-line-src';
const LINE_LYR = 'palm-geo-line-lyr';
const PT_SRC = 'palm-geo-pt-src';
const PT_LYR = 'palm-geo-pt-lyr';
const CANVAS_H = 280;
const MARGIN = { top: 10, right: 20, bottom: 30, left: 50 };

interface GeologyPanelProps {
  tool: GeologyProfileTool;
}

export function GeologyPanel({ tool }: GeologyPanelProps) {
  const [profileLine, setProfileLine] = useState<LngLat[]>(tool.state.profileLine);
  const [profile, setProfile] = useState<GeoProfile | null>(tool.state.profile);
  const [status, setStatus] = useState(tool.state.status);
  const [error, setError] = useState<string | null>(tool.state.error);
  const [mockMode, setMockMode] = useState(tool.state.mockMode);
  const [geoApiError, setGeoApiError] = useState<string | null>(null);
  const [hoverUnit, setHoverUnit] = useState<GeoUnit | null>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleClickRef = useRef<((pt: LngLat) => void) | null>(null);

  // sync tool → local
  useEffect(() => {
    const onStateChange = () => {
      setProfileLine([...tool.state.profileLine]);
      setProfile(tool.state.profile);
      setStatus(tool.state.status);
      setError(tool.state.error);
      setMockMode(tool.state.mockMode);
    };
    tool.setOnStateChange(onStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool]);

  // mount
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map;
    mapRef.current = map;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      handleClickRef.current?.([e.lngLat.lng, e.lngLat.lat]);
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
      cleanupAll(map);
    };
  }, []);

  // canvas hover
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const plotW = canvas.width - MARGIN.left - MARGIN.right;
      const plotH = canvas.height - MARGIN.top - MARGIN.bottom;
      const surfH = plotH * 0.45;
      const geoH = plotH * 0.45;

      if (mx < MARGIN.left || mx > MARGIN.left + plotW) {
        setHoverUnit(null);
        return;
      }

      const pro = profile;
      if (!pro) return;

      const surfY = MARGIN.top + surfH;
      const geoY = surfY + 20;

      // 检查是否在地下岩层区域
      if (my >= geoY && my <= geoY + geoH) {
        const t = (mx - MARGIN.left) / plotW;
        const idx = Math.floor(t * (pro.points.length - 1));
        const pt = pro.points[Math.min(idx, pro.points.length - 1)];
        if (pt?.units && pt.units.length > 0) {
          const relY = (my - geoY) / geoH;
          // 找到被点击的岩层
          const allDepths = pt.units.flatMap((u) => [
            Math.abs(u.topDepthM),
            Math.abs(u.bottomDepthM),
          ]);
          const maxDepth = Math.max(...allDepths, 100);
          const depthAtClick = relY * maxDepth;
          for (const unit of pt.units) {
            const top = Math.abs(unit.topDepthM);
            const bot = Math.abs(unit.bottomDepthM);
            if (depthAtClick >= top && depthAtClick <= bot) {
              setHoverUnit(unit);
              return;
            }
          }
        }
      }
      setHoverUnit(null);
    };
    canvas.addEventListener('mousemove', onMove);
    return () => canvas.removeEventListener('mousemove', onMove);
  }, [profile]);

  useEffect(() => {
    if (profile) renderCanvas(profile);
  }, [profile]);

  // click handler
  const handleMapClick = useCallback(
    (pt: LngLat) => {
      // 直接用 tool.state 读避免闭包过期
      if (tool.state.status === 'loading') return;
      tool.addPoint(pt);
      const map = mapRef.current;
      if (map) renderLineOnMap(map, tool.state.profileLine);
      if (tool.state.profileLine.length >= 2) {
        triggerAnalysis();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  handleClickRef.current = handleMapClick;

  // profiling
  async function triggerAnalysis() {
    const line = tool.state.profileLine;
    if (line.length < 2) return;

    const map = mapRef.current;
    if (!map) return;

    tool.setStatus('loading');
    tool.setError(null);
    setGeoApiError(null);

    try {
      // 1. 采样 DEM
      const sampleCount = Math.min(
        100,
        Math.max(
          10,
          Math.floor(
            haversineDistanceM(
              line[0]![0],
              line[0]![1],
              line[line.length - 1]![0],
              line[line.length - 1]![1],
            ) / 100,
          ),
        ),
      );
      const samples: LngLat[] = [];
      for (let i = 0; i < sampleCount; i++) {
        const t = i / (sampleCount - 1);
        const idx = t * (line.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.min(lo + 1, line.length - 1);
        const frac = idx - lo;
        samples.push([
          line[lo]![0] + (line[hi]![0] - line[lo]![0]) * frac,
          line[lo]![1] + (line[hi]![1] - line[lo]![1]) * frac,
        ]);
      }
      const elevations = await queryElevations(samples, { resolutionMeters: 90 });

      // 2. 查询地质数据（采样间隔取约每 5 个点）
      const geoPoints: GeoProfilePoint[] = [];
      let cumulativeDistKm = 0;

      for (let i = 0; i < samples.length; i++) {
        const [lng, lat] = samples[i]!;
        const ele = elevations[i] ?? 0;

        if (i > 0) {
          cumulativeDistKm +=
            haversineDistanceM(samples[i - 1]![0], samples[i - 1]![1], lng, lat) / 1000;
        }

        // 每 5 个点查询一次地质，中间点复用最近的地质数据
        let units: GeoUnit[] = [];
        if (i % 5 === 0 || i === 0 || i === samples.length - 1) {
          if (mockMode) {
            units = generateMockGeology(lng, lat);
          } else {
            const result = await fetchGeoUnits(lng, lat, 5);
            if (result.source === 'api' && result.units.length > 0) {
              units = result.units;
              setGeoApiError(null);
            } else {
              units = generateMockGeology(lng, lat);
              setGeoApiError(result.error ?? '部分区域无详细地质数据');
            }
          }
        } else if (geoPoints.length > 0) {
          units = geoPoints[geoPoints.length - 1]!.units;
        }

        geoPoints.push({
          surfaceElevationM: ele,
          distanceKm: cumulativeDistKm,
          units,
        });
      }

      const allUnits = dedupeUnits(geoPoints.flatMap((p) => p.units));
      const prof: GeoProfile = {
        line: [...line],
        points: geoPoints,
        totalLengthKm: cumulativeDistKm,
        allUnits,
      };

      tool.setProfile(prof);
      tool.setStatus('ready');
      renderLineOnMap(map, line);
      renderCanvas(prof);
    } catch (err) {
      tool.setError(err instanceof Error ? err.message : '查询失败');
      tool.setStatus('error');
    }
  }

  // Canvas rendering
  function renderCanvas(prof: GeoProfile) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = CANVAS_H * dpr;
    canvas.style.width = `${canvas.clientWidth}px`;
    canvas.style.height = `${CANVAS_H}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const w = canvas.clientWidth;
    const h = CANVAS_H;
    const plotW = w - MARGIN.left - MARGIN.right;
    const plotH = h - MARGIN.top - MARGIN.bottom;
    const surfH = plotH * 0.45;
    const geoH = plotH * 0.45;

    ctx.clearRect(0, 0, w, h);

    // 背景
    ctx.fillStyle = '#0d1217';
    ctx.fillRect(0, 0, w, h);

    // ---- 上板：地表高程 ----
    const elevations = prof.points.map((p) => p.surfaceElevationM);
    const eleMin = Math.min(...elevations) - 10;
    const eleMax = Math.max(...elevations) + 10;
    const eleRange = eleMax - eleMin || 1;

    const surfY = MARGIN.top + surfH;

    // 网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = surfY - (i / 4) * surfH;
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(MARGIN.left + plotW, y);
      ctx.stroke();
    }

    // Y 轴标签
    ctx.fillStyle = 'var(--pw-text-muted)';
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = eleMin + (i / 4) * eleRange;
      const y = surfY - (i / 4) * surfH;
      ctx.fillText(`${Math.round(val)}`, MARGIN.left - 4, y + 3);
    }

    // 地表线
    ctx.beginPath();
    ctx.strokeStyle = '#38c49b';
    ctx.lineWidth = 2;
    for (let i = 0; i < prof.points.length; i++) {
      const x = MARGIN.left + (prof.points[i]!.distanceKm / prof.totalLengthKm) * plotW;
      const y = surfY - ((prof.points[i]!.surfaceElevationM - eleMin) / eleRange) * surfH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 填充
    ctx.lineTo(MARGIN.left + plotW, surfY);
    ctx.lineTo(MARGIN.left, surfY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,196,155,0.1)';
    ctx.fill();

    // X 轴标签
    ctx.fillStyle = 'var(--pw-text-muted)';
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const kmLabels = [
      0,
      Math.round(prof.totalLengthKm / 3),
      Math.round((2 * prof.totalLengthKm) / 3),
      Math.round(prof.totalLengthKm),
    ];
    for (let i = 0; i < kmLabels.length; i++) {
      const x = MARGIN.left + (i / (kmLabels.length - 1)) * plotW;
      ctx.fillText(`${kmLabels[i]} km`, x, surfY + 12);
    }

    // ---- 下板：岩层结构 ----
    if (prof.points.length > 0 && prof.points[0]!.units.length > 0) {
      const geoY = surfY + 20;
      // 找最大深度
      let maxDepth = 0;
      for (const p of prof.points) {
        for (const u of p.units) {
          maxDepth = Math.max(maxDepth, Math.abs(u.bottomDepthM));
        }
      }
      maxDepth = Math.max(maxDepth, 100);

      // 网格线
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i <= 4; i++) {
        const y = geoY + (i / 4) * geoH;
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y);
        ctx.lineTo(MARGIN.left + plotW, y);
        ctx.stroke();
      }

      // Y 轴标签
      ctx.fillStyle = 'var(--pw-text-muted)';
      ctx.font = '9px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 4; i++) {
        const val = (i / 4) * maxDepth;
        const y = geoY + (i / 4) * geoH;
        ctx.fillText(`${Math.round(val)}`, MARGIN.left - 4, y + 3);
      }

      // 渲染岩层
      for (let pi = 0; pi < prof.points.length; pi++) {
        const pt = prof.points[pi]!;
        if (pt.units.length === 0) continue;

        const xLeft =
          MARGIN.left + (pi > 0 ? prof.points[pi - 1]!.distanceKm / prof.totalLengthKm : 0) * plotW;
        const xRight = MARGIN.left + (pt.distanceKm / prof.totalLengthKm) * plotW;

        // 从地表向下逐层渲染
        for (const unit of pt.units) {
          const yTop = geoY + (Math.abs(unit.topDepthM) / maxDepth) * geoH;
          const yBot = geoY + (Math.abs(unit.bottomDepthM) / maxDepth) * geoH;

          ctx.fillStyle = LITHOLOGY_COLORS[unit.lithology] + '88';
          ctx.fillRect(xLeft, yTop, Math.max(1, xRight - xLeft + 1), Math.max(1, yBot - yTop));
          ctx.strokeStyle = LITHOLOGY_COLORS[unit.lithology];
          ctx.lineWidth = 0.5;
          ctx.strokeRect(xLeft, yTop, Math.max(1, xRight - xLeft + 1), Math.max(0.5, yBot - yTop));
        }
      }

      // 岩层标签
      ctx.fillStyle = 'var(--pw-text-muted)';
      ctx.font = '8px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      const midPt = prof.points[Math.floor(prof.points.length / 2)]!;
      for (const unit of midPt.units) {
        const yMid =
          geoY + ((Math.abs(unit.topDepthM) + Math.abs(unit.bottomDepthM)) / 2 / maxDepth) * geoH;
        ctx.fillText(unit.name, MARGIN.left + plotW + 4, yMid + 3);
      }
    }

    // 标签: 地表
    ctx.fillStyle = '#38c49b';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('地表高程', MARGIN.left, MARGIN.top + 10);

    // 标签: 地下
    if (prof.points.length > 0 && prof.points[0]!.units.length > 0) {
      ctx.fillStyle = '#87CEEB';
      ctx.fillText('地下岩层', MARGIN.left, surfY + 34);
    }
  }

  // status label
  const statusText: Record<string, string> = {
    idle: '点击地图画剖面线',
    drawing: '点击添加终点...',
    loading: '查询地质数据...',
    ready: '剖面就绪',
    error: '查询失败',
  };

  return (
    <div className="pw-panel-stack">
      {/* 状态 */}
      <div
        className={`pw-panel-status ${status === 'loading' ? 'is-warning' : status === 'error' ? 'is-danger' : status === 'ready' ? 'is-success' : ''}`}
      >
        {status === 'loading' && (
          <LoaderCircle size={14} style={{ animation: 'spin 1s linear infinite' }} />
        )}
        {status === 'idle' && <MousePointer2 size={14} />}
        {status === 'error' && <AlertTriangle size={14} />}
        <span>
          {statusText[status]}
          {mockMode && status === 'ready' ? ' (模拟数据)' : ''}
        </span>
      </div>

      {/* 数据来源标注 */}
      {status === 'ready' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 4,
            fontSize: 10,
            background: mockMode ? '#f39c1215' : '#2ecc7115',
            border: `1px solid ${mockMode ? '#f39c1244' : '#2ecc7144'}`,
          }}
        >
          <AlertTriangle size={12} style={{ color: mockMode ? '#f39c12' : '#2ecc71' }} />
          <span style={{ color: 'var(--pw-text)' }}>
            {mockMode
              ? `岩层数据为内置模拟数据（Macrostrat API 不可用：${geoApiError ?? '未知错误'}）。模拟数据基于经纬度确定性生成，不代表真实地质情况。`
              : '岩层数据来自 Macrostrat API (macrostrat.org)，为真实地质调查数据。'}
          </span>
        </div>
      )}

      {/* Canvas */}
      {profile && (
        <div
          style={{
            position: 'relative',
            border: '1px solid var(--pw-border)',
            borderRadius: 6,
            overflow: 'hidden',
            background: '#0d1217',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: CANVAS_H, display: 'block', cursor: 'crosshair' }}
          />
        </div>
      )}

      {/* 图例 */}
      {profile && profile.allUnits.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {profile.allUnits.map((u, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 3,
                background: '#0d1217',
                border: '1px solid var(--pw-border)',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: LITHOLOGY_COLORS[u.lithology],
                  flexShrink: 0,
                }}
              />
              {u.name}
            </span>
          ))}
        </div>
      )}

      {/* hover unit info */}
      {hoverUnit && (
        <div
          style={{
            padding: 8,
            borderRadius: 4,
            background: '#0d1217',
            border: '1px solid var(--pw-border)',
            fontSize: 11,
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--pw-text)' }}>{hoverUnit.name}</div>
          <div style={{ color: 'var(--pw-text-muted)' }}>
            {ERA_LABELS[hoverUnit.era]} · {LITHOLOGY_LABELS[hoverUnit.lithology]}
          </div>
          <div style={{ color: 'var(--pw-text-faint)', fontSize: 10 }}>
            厚度: {Math.round(hoverUnit.thicknessM)}m · 深度:{' '}
            {Math.round(Math.abs(hoverUnit.topDepthM))}–
            {Math.round(Math.abs(hoverUnit.bottomDepthM))}m
          </div>
        </div>
      )}

      {/* 操作 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button
          type="button"
          className="pw-secondary-button"
          onClick={() => {
            tool.setMockMode(!mockMode);
            if (profileLine.length >= 2) triggerAnalysis();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 11,
          }}
        >
          <Database size={14} />
          {mockMode ? '在线查询' : '模拟数据'}
        </button>
        <button
          type="button"
          className="pw-secondary-button"
          onClick={() => {
            tool.reset();
            if (mapRef.current) cleanupAll(mapRef.current);
          }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <RotateCcw size={14} />
          重置
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 10, color: 'var(--pw-danger)', padding: '4px 0' }}>{error}</div>
      )}
    </div>
  );
}

// ---- helpers ----

function renderLineOnMap(map: maplibregl.Map, line: LngLat[]) {
  cleanupAll(map);
  if (line.length > 1) {
    const geojson: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: line },
      properties: {},
    };
    map.addSource(LINE_SRC, { type: 'geojson', data: geojson });
    map.addLayer({
      id: LINE_LYR,
      source: LINE_SRC,
      type: 'line',
      paint: { 'line-color': '#e74c3c', 'line-width': 3, 'line-dasharray': [4, 2] },
    });
  }

  // 端点标记
  const ptGeojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: line.map((point, index) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: point },
      properties: { type: index === 0 ? 'start' : 'end' },
    })),
  };
  map.addSource(PT_SRC, { type: 'geojson', data: ptGeojson });
  map.addLayer({
    id: PT_LYR,
    source: PT_SRC,
    type: 'circle',
    paint: {
      'circle-radius': 6,
      'circle-color': ['match', ['get', 'type'], 'start', '#2ecc71', '#e74c3c'],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  });
}

function cleanupAll(map: maplibregl.Map) {
  for (const id of [LINE_LYR, PT_LYR])
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* */
    }
  for (const id of [LINE_SRC, PT_SRC])
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch {
      /* */
    }
}

function dedupeUnits(units: GeoUnit[]): GeoUnit[] {
  const seen = new Set<string>();
  return units.filter((u) => {
    const key = u.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
