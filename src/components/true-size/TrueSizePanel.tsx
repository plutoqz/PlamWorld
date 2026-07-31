// components/true-size/TrueSizePanel.tsx — 真实大小比较面板
//
// UI：两个区域选择器 + 幽灵图层 + 面积对比卡片

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { TrueSizeTool } from '../../tools/true-size.tool';
import type { CountryFeature } from '../../data/boundaries';
import { getCountries, searchCountries } from '../../data/boundaries';
import { reprojectFeature, featureLatCenter, mercatorScale } from '../../core/projection';
import { MapSketchOverlay } from '../../engines/maplibre/sketch-overlay';
import type { SketchStyle } from '../../engines/maplibre/sketch-overlay';
import type { LngLat } from '../../core/types';

// ---- constants ----
const REGION_A_STYLE: SketchStyle = {
  strokeColor: '#4fc3f7', strokeWidth: 3, fillColor: '#4fc3f7', fillOpacity: 0.18,
};
const REGION_B_STYLE: SketchStyle = {
  strokeColor: '#ffb74d', strokeWidth: 3, fillColor: '#ffb74d', fillOpacity: 0.22,
};
const GHOST_STYLE: SketchStyle = {
  strokeColor: '#4fc3f7', strokeWidth: 4, strokeDash: '10 6',
  fillColor: '#4fc3f7', fillOpacity: 0.32,
};

interface ShapeOverlays {
  regionA: MapSketchOverlay[];
  regionB: MapSketchOverlay[];
  ghost: MapSketchOverlay[];
}

// ---- component ----

interface TrueSizePanelProps {
  tool: TrueSizeTool;
}

export function TrueSizePanel({ tool }: TrueSizePanelProps) {
  const [queryA, setQueryA] = useState('');
  const [queryB, setQueryB] = useState('');
  const [regionA, setRegionA] = useState<CountryFeature | null>(null);
  const [regionB, setRegionB] = useState<CountryFeature | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState<[number, number] | null>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const ghostCenterRef = useRef<[number, number] | null>(null);
  const overlaysRef = useRef<ShapeOverlays>({ regionA: [], regionB: [], ghost: [] });

  // ---- 搜索建议 ----
  const suggestionsA = useMemo(() => {
    if (!queryA || queryA.length < 1) return getCountries().slice(0, 15);
    return searchCountries(queryA).slice(0, 8);
  }, [queryA]);

  const suggestionsB = useMemo(() => {
    if (!queryB || queryB.length < 1) return getCountries().slice(0, 15);
    return searchCountries(queryB).slice(0, 8);
  }, [queryB]);

  // ---- 初始化引擎 ----
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map;
    mapRef.current = map;

    tool.setOnStateChange(() => {
      setRegionA(tool.regionA);
      setRegionB(tool.regionB);
    });

    return () => {
      tool.setOnStateChange(null);
      cleanupOverlays(overlaysRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 选择区域 ----
  const selectA = useCallback((c: CountryFeature) => {
    setRegionA(c);
    setQueryA(c.nameZh || c.name);
    tool.setRegionA(c);
    const map = mapRef.current;
    if (!map) return;

    if (regionB) {
      const targetCenter = featureLatCenter(regionB.feature).center;
      ghostCenterRef.current = targetCenter;
      tool.setGhostCenter(targetCenter);
      clearOverlays(overlaysRef.current.regionA);
      const ghost = renderGhost(map, c, targetCenter, overlaysRef.current.ghost);
      fitFeatures(map, [regionB.feature, ghost]);
    } else {
      renderOutline(map, c, overlaysRef.current.regionA, REGION_A_STYLE);
      const ghost = renderGhost(map, c, tool.ghostCenter, overlaysRef.current.ghost);
      fitFeatures(map, [c.feature, ghost]);
    }
  }, [regionB, tool]);

  const selectB = useCallback((c: CountryFeature) => {
    setRegionB(c);
    setQueryB(c.nameZh || c.name);
    tool.setRegionB(c);
    const map = mapRef.current;
    if (!map) return;
    renderOutline(map, c, overlaysRef.current.regionB, REGION_B_STYLE);
    if (regionA) {
      const targetCenter = featureLatCenter(c.feature).center;
      ghostCenterRef.current = targetCenter;
      tool.setGhostCenter(targetCenter);
      clearOverlays(overlaysRef.current.regionA);
      const ghost = renderGhost(map, regionA, targetCenter, overlaysRef.current.ghost);
      fitFeatures(map, [c.feature, ghost]);
    } else {
      fitFeatures(map, [c.feature]);
    }
  }, [regionA, tool]);

  const commitQueryA = useCallback(() => {
    const match = pickCountry(queryA, suggestionsA);
    if (match) selectA(match);
  }, [queryA, selectA, suggestionsA]);

  const commitQueryB = useCallback(() => {
    const match = pickCountry(queryB, suggestionsB);
    if (match) selectB(match);
  }, [queryB, selectB, suggestionsB]);

  const changeQueryA = useCallback((value: string) => {
    setQueryA(value);
    if (!regionA || value === (regionA.nameZh || regionA.name)) return;
    setRegionA(null);
    tool.setRegionA(null);
    const map = mapRef.current;
    if (map) {
      clearOverlays(overlaysRef.current.regionA);
      clearOverlays(overlaysRef.current.ghost);
      if (regionB) fitFeatures(map, [regionB.feature]);
    }
  }, [regionA, regionB, tool]);

  const changeQueryB = useCallback((value: string) => {
    setQueryB(value);
    if (!regionB || value === (regionB.nameZh || regionB.name)) return;
    setRegionB(null);
    tool.setRegionB(null);
    const map = mapRef.current;
    if (map) {
      clearOverlays(overlaysRef.current.regionB);
      if (regionA) {
        const center = featureLatCenter(regionA.feature).center;
        ghostCenterRef.current = center;
        tool.setGhostCenter(center);
        renderOutline(map, regionA, overlaysRef.current.regionA, REGION_A_STYLE);
        const ghost = renderGhost(map, regionA, center, overlaysRef.current.ghost);
        fitFeatures(map, [regionA.feature, ghost]);
      }
    }
  }, [regionA, regionB, tool]);

  // ---- 幽灵拖动 ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !regionA) return;

    if (dragging) {
      map.getCanvas().style.cursor = 'grabbing';
    } else {
      map.getCanvas().style.cursor = '';
      if (dragPos) {
        // 松手 → 固定位置
        ghostCenterRef.current = dragPos;
        renderGhost(map, regionA, dragPos, overlaysRef.current.ghost);
        tool.setGhostCenter(dragPos);
      }
    }
  }, [dragging, dragPos, regionA]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMapMouseMove = useCallback((e: maplibregl.MapMouseEvent) => {
    if (!dragging || !regionA) return;
    const pos: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    setDragPos(pos);
    renderGhost(mapRef.current!, regionA, pos, overlaysRef.current.ghost);
  }, [dragging, regionA]);

  const handleMapMouseDown = useCallback((e: maplibregl.MapMouseEvent) => {
    if (!regionA) return;
    // 判断点击点是否在幽灵附近（简单容差）
    e.preventDefault?.();
    setDragging(true);
    setDragPos([e.lngLat.lng, e.lngLat.lat]);
    mapRef.current!.getCanvas().style.cursor = 'grabbing';
  }, [regionA]);

  const handleMapMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  // 注册地图拖拽事件
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !regionA) return;

    if (regionA) {
      map.on('mousemove', handleMapMouseMove);
      map.on('mousedown', handleMapMouseDown);
      map.on('mouseup', handleMapMouseUp);

      // 初始渲染幽灵
      renderGhost(map, regionA, tool.ghostCenter, overlaysRef.current.ghost);

      return () => {
        map.off('mousemove', handleMapMouseMove);
        map.off('mousedown', handleMapMouseDown);
        map.off('mouseup', handleMapMouseUp);
        clearOverlays(overlaysRef.current.ghost);
      };
    }
  }, [regionA]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 面积比较 ----
  const compare = useMemo(() => {
    if (!regionA || !regionB) return null;

    const { lat: latA } = featureLatCenter(regionA.feature);
    const { lat: latB } = featureLatCenter(regionB.feature);
    const scale = mercatorScale(latA, latB);

    // 用幽灵中心纬度做缩放校正
    const ghostLat = ghostCenterRef.current?.[1] ?? latA;
    const ghostScale = mercatorScale(latA, ghostLat);

    return {
      latA: latA.toFixed(1),
      latB: latB.toFixed(1),
      mercatorDistortion: (1 / (Math.cos((latA * Math.PI) / 180) ** 2) - 1).toFixed(1),
      scaleAtoB: scale.toFixed(3),
      ghostScale: ghostScale.toFixed(3),
      ghostLat: ghostLat.toFixed(1),
    };
  }, [regionA, regionB, dragging]);

  return (
    <div style={{
      position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
      zIndex: 2000, width: 420, maxWidth: '95vw',
      background: 'rgba(10,10,20,0.9)', backdropFilter: 'blur(16px)',
      borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)',
      padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* 标题 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
        📐 真实大小比较
      </div>

      {/* 区域 A 选择 */}
      <div style={{ position: 'relative' }}>
        <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>
          区域 A（幽灵，拖动地图移动）
        </label>
        <input
          value={queryA}
          onChange={(e) => changeQueryA(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitQueryA();
          }}
          placeholder="搜索国家..."
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, color: '#fff', padding: '6px 10px', fontSize: 12,
          }}
        />
        {queryA && !regionA && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
            background: 'rgba(10,10,20,0.95)', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            maxHeight: 160, overflow: 'auto',
          }}>
            {suggestionsA.map((c) => (
              <div
                key={c.iso}
                onClick={() => selectA(c)}
                style={{
                  padding: '5px 10px', cursor: 'pointer', fontSize: 12,
                  color: 'rgba(255,255,255,0.7)',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {c.nameZh} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{c.name}</span>
              </div>
            ))}
          </div>
        )}
        {regionA && (
          <div style={{ fontSize: 11, color: '#4fc3f7', marginTop: 2 }}>
            ✅ 已选：{regionA.nameZh || regionA.name}
          </div>
        )}
      </div>

      {/* 区域 B 选择 */}
      <div style={{ position: 'relative' }}>
        <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>
          区域 B（参考，固定在地图上）
        </label>
        <input
          value={queryB}
          onChange={(e) => changeQueryB(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitQueryB();
          }}
          placeholder="搜索国家..."
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, color: '#fff', padding: '6px 10px', fontSize: 12,
          }}
        />
        {queryB && !regionB && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
            background: 'rgba(10,10,20,0.95)', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            maxHeight: 160, overflow: 'auto',
          }}>
            {suggestionsB.map((c) => (
              <div
                key={c.iso}
                onClick={() => selectB(c)}
                style={{
                  padding: '5px 10px', cursor: 'pointer', fontSize: 12,
                  color: 'rgba(255,255,255,0.7)',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {c.nameZh} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{c.name}</span>
              </div>
            ))}
          </div>
        )}
        {regionB && (
          <div style={{ fontSize: 11, color: '#ffb74d', marginTop: 2 }}>
            ✅ 已选：{regionB.nameZh || regionB.name}
          </div>
        )}
      </div>

      {/* 拖拽提示 */}
      {regionA && (
        <div style={{
          fontSize: 11, color: dragging ? '#81c784' : 'rgba(255,255,255,0.4)',
          textAlign: 'center',
          padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          {dragging
            ? '🖐 拖动幽灵图层到目标纬度...松手固定'
            : '🖱 在地图上点击并拖动幽灵图层'}
        </div>
      )}

      {/* 对比信息 */}
      {compare && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px',
          fontSize: 11, color: 'rgba(255,255,255,0.6)',
          borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8,
        }}>
          <span>{regionA!.nameZh} 纬度</span><b style={{ color: '#4fc3f7' }}>{compare.latA}°</b>
          <span>{regionB!.nameZh} 纬度</span><b style={{ color: '#ffb74d' }}>{compare.latB}°</b>
          <span>Mercator 失真</span><b style={{ color: '#ef5350' }}>~{compare.mercatorDistortion}x</b>
          <span>缩放因子 (A→B)</span><b style={{ color: '#fff' }}>{compare.scaleAtoB}x</b>
          <span>当前幽灵纬度</span><b style={{ color: '#81c784' }}>{compare.ghostLat}°</b>
          <span>当前缩放</span><b style={{ color: '#81c784' }}>{compare.ghostScale}x</b>
        </div>
      )}

      {/* 图例 */}
      <div style={{
        display: 'flex', gap: 16, fontSize: 10, color: 'rgba(255,255,255,0.3)',
        borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6,
      }}>
        <span>🟦 区域 A（幽灵）</span>
        <span>🟧 区域 B</span>
      </div>
    </div>
  );
}

// ---- 渲染函数 ----

function renderOutline(
  map: maplibregl.Map,
  country: CountryFeature,
  overlays: MapSketchOverlay[],
  style: SketchStyle,
): void {
  updateOverlays(map, overlays, country.feature, style);
}

function renderGhost(
  map: maplibregl.Map,
  country: CountryFeature,
  center: [number, number],
  overlays: MapSketchOverlay[],
): Feature<Polygon | MultiPolygon> {
  const { lat: fromLat } = featureLatCenter(country.feature);
  const ghost = reprojectFeature(country.feature, fromLat, center[1], center);
  updateOverlays(map, overlays, ghost, GHOST_STYLE);
  return ghost;
}

function updateOverlays(
  map: maplibregl.Map,
  overlays: MapSketchOverlay[],
  feature: Feature<Polygon | MultiPolygon>,
  style: SketchStyle,
): void {
  const rings = outerRings(feature);
  while (overlays.length > rings.length) overlays.pop()?.remove();
  for (let index = 0; index < rings.length; index += 1) {
    const overlay = overlays[index] ?? new MapSketchOverlay(map, style);
    if (!overlays[index]) overlays[index] = overlay;
    overlay.setStyle(style);
    overlay.setCoordinates(rings[index], true);
  }
}

function outerRings(feature: Feature<Polygon | MultiPolygon>): LngLat[][] {
  const rings = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates[0]]
    : feature.geometry.coordinates.map((polygon) => polygon[0]);
  return rings.map((ring) => ring.map((position) => [position[0], position[1]]));
}

function clearOverlays(overlays: MapSketchOverlay[]): void {
  for (const overlay of overlays) overlay.remove();
  overlays.length = 0;
}

function cleanupOverlays(overlays: ShapeOverlays): void {
  clearOverlays(overlays.regionA);
  clearOverlays(overlays.regionB);
  clearOverlays(overlays.ghost);
}

function pickCountry(query: string, suggestions: readonly CountryFeature[]): CountryFeature | null {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return null;
  return suggestions.find((country) =>
    country.name.toLocaleLowerCase() === normalized || country.nameZh === query.trim()
  ) ?? suggestions[0] ?? null;
}

function fitFeatures(
  map: maplibregl.Map,
  features: ReadonlyArray<Feature<Polygon | MultiPolygon>>,
): void {
  const bounds = new maplibregl.LngLatBounds();
  for (const feature of features) {
    extendBounds(bounds, feature.geometry.coordinates);
  }
  if (bounds.isEmpty()) return;

  map.fitBounds(bounds, {
    padding: { top: 72, right: 64, bottom: 190, left: 280 },
    maxZoom: 5,
    duration: 700,
  });
}

function extendBounds(bounds: maplibregl.LngLatBounds, coordinates: unknown): void {
  if (!Array.isArray(coordinates)) return;
  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === 'number' &&
    typeof coordinates[1] === 'number'
  ) {
    bounds.extend([coordinates[0], coordinates[1]]);
    return;
  }
  for (const child of coordinates) extendBounds(bounds, child);
}
