// components/true-size/TrueSizePanel.tsx — 真实大小比较面板
//
// UI：两个区域选择器 + 幽灵图层 + 面积对比卡片 + 墨卡托失真分析 + 智能拖拽与预设跳转

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { TrueSizeTool } from '../../tools/true-size.tool';
import type { CountryFeature } from '../../data/boundaries';
import { searchRegions } from '../../data/boundaries';
import {
  reprojectFeature,
  featureLatCenter,
  mercatorScale,
  calculateGeodesicAreaKm2,
  formatGeodesicArea,
  pointInFeature,
} from '../../core/projection';
import { MapSketchOverlay } from '../../engines/maplibre/sketch-overlay';
import type { SketchStyle } from '../../engines/maplibre/sketch-overlay';
import type { LngLat } from '../../core/types';

// ---- constants ----
const REGION_A_STYLE: SketchStyle = {
  strokeColor: '#4fc3f7',
  strokeWidth: 3,
  fillColor: '#4fc3f7',
  fillOpacity: 0.18,
};
const REGION_B_STYLE: SketchStyle = {
  strokeColor: '#ffb74d',
  strokeWidth: 3,
  fillColor: '#ffb74d',
  fillOpacity: 0.22,
};
const GHOST_STYLE: SketchStyle = {
  strokeColor: '#4fc3f7',
  strokeWidth: 3.5,
  strokeDash: '8 5',
  fillColor: '#4fc3f7',
  fillOpacity: 0.32,
};

interface ShapeOverlays {
  regionA: MapSketchOverlay[];
  regionB: MapSketchOverlay[];
  ghost: MapSketchOverlay[];
}

interface TrueSizePanelProps {
  tool: TrueSizeTool;
}

export function TrueSizePanel({ tool }: TrueSizePanelProps) {
  const [queryA, setQueryA] = useState('');
  const [queryB, setQueryB] = useState('');
  const [regionA, setRegionA] = useState<CountryFeature | null>(null);
  const [regionB, setRegionB] = useState<CountryFeature | null>(null);
  const [tabA, setTabA] = useState<'all' | 'country' | 'province'>('all');
  const [tabB, setTabB] = useState<'all' | 'country' | 'province'>('all');
  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState<[number, number] | null>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const ghostCenterRef = useRef<[number, number] | null>(null);
  const ghostFeatureRef = useRef<Feature<Polygon | MultiPolygon> | null>(null);
  const overlaysRef = useRef<ShapeOverlays>({ regionA: [], regionB: [], ghost: [] });
  const handleMarkerRef = useRef<maplibregl.Marker | null>(null);
  const draggingRef = useRef(false);
  const hoveringGhostRef = useRef(false);
  const dragOffsetRef = useRef<[number, number]>([0, 0]);

  // ---- 搜索建议（国家 + 省份） ----
  const suggestionsA = useMemo(() => {
    return searchRegions(queryA, tabA).slice(0, 10);
  }, [queryA, tabA]);

  const suggestionsB = useMemo(() => {
    return searchRegions(queryB, tabB).slice(0, 10);
  }, [queryB, tabB]);

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
      if (handleMarkerRef.current) {
        handleMarkerRef.current.remove();
        handleMarkerRef.current = null;
      }
      map.getCanvas().style.cursor = '';
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 移动幽灵多边形与手柄辅助 ----
  const moveGhostTo = useCallback((map: maplibregl.Map, center: [number, number]) => {
    if (!regionA) return;
    ghostCenterRef.current = center;
    const ghost = renderGhost(map, regionA, center, overlaysRef.current.ghost);
    ghostFeatureRef.current = ghost;
    tool.setGhostCenter(center);
    setDragPos(center);

    if (handleMarkerRef.current) {
      handleMarkerRef.current.setLngLat(center);
    }
  }, [regionA, tool]);

  // ---- 选择区域 ----
  const selectA = useCallback((c: CountryFeature) => {
    setRegionA(c);
    setQueryA(c.nameZh || c.name);
    tool.setRegionA(c);
    const map = mapRef.current;
    if (!map) return;

    if (regionB) {
      const targetCenter = featureLatCenter(regionB.feature).center;
      moveGhostTo(map, targetCenter);
      clearOverlays(overlaysRef.current.regionA);
      fitFeatures(map, [regionB.feature, ghostFeatureRef.current!]);
    } else {
      renderOutline(map, c, overlaysRef.current.regionA, REGION_A_STYLE);
      const center = featureLatCenter(c.feature).center;
      moveGhostTo(map, center);
      fitFeatures(map, [c.feature, ghostFeatureRef.current!]);
    }
  }, [moveGhostTo, regionB, tool]);

  const selectB = useCallback((c: CountryFeature) => {
    setRegionB(c);
    setQueryB(c.nameZh || c.name);
    tool.setRegionB(c);
    const map = mapRef.current;
    if (!map) return;
    renderOutline(map, c, overlaysRef.current.regionB, REGION_B_STYLE);
    if (regionA) {
      const targetCenter = featureLatCenter(c.feature).center;
      moveGhostTo(map, targetCenter);
      clearOverlays(overlaysRef.current.regionA);
      fitFeatures(map, [c.feature, ghostFeatureRef.current!]);
    } else {
      fitFeatures(map, [c.feature]);
    }
  }, [moveGhostTo, regionA, tool]);

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
      ghostFeatureRef.current = null;
      ghostCenterRef.current = null;
      if (handleMarkerRef.current) {
        handleMarkerRef.current.remove();
        handleMarkerRef.current = null;
      }
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
        renderOutline(map, regionA, overlaysRef.current.regionA, REGION_A_STYLE);
        moveGhostTo(map, center);
        fitFeatures(map, [regionA.feature, ghostFeatureRef.current!]);
      }
    }
  }, [moveGhostTo, regionA, regionB, tool]);

  // ---- 幽灵拖拽手柄 Marker ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !regionA) {
      if (handleMarkerRef.current) {
        handleMarkerRef.current.remove();
        handleMarkerRef.current = null;
      }
      return;
    }

    const currentCenter = ghostCenterRef.current ?? featureLatCenter(regionA.feature).center;

    if (!handleMarkerRef.current) {
      const el = document.createElement('div');
      el.style.cssText = `
        display: inline-flex; align-items: center; gap: 4px;
        background: rgba(10, 20, 35, 0.92);
        border: 1.5px solid #4fc3f7;
        color: #e0f7fa;
        padding: 3px 8px;
        border-radius: 12px;
        font: 600 11px system-ui, -apple-system, sans-serif;
        box-shadow: 0 0 12px rgba(79, 195, 247, 0.45), 0 3px 8px rgba(0,0,0,0.6);
        cursor: grab;
        user-select: none;
        white-space: nowrap;
        pointer-events: auto;
      `;
      el.innerHTML = '<span style="color:#4fc3f7;font-size:12px;">✥</span><span>拖拽幽灵</span>';

      el.addEventListener('mousedown', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        if (!mapRef.current || !regionA) return;
        mapRef.current.dragPan.disable();
        draggingRef.current = true;
        hoveringGhostRef.current = true;
        setDragging(true);
        mapRef.current.getCanvas().style.cursor = 'grabbing';
        dragOffsetRef.current = [0, 0];
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(currentCenter)
        .addTo(map);
      handleMarkerRef.current = marker;
    } else {
      handleMarkerRef.current.setLngLat(currentCenter);
    }
  }, [regionA]);

  // ---- 鼠标交互事件处理 (修复全图拖拽劫持缺陷) ----
  const handleMapMouseMove = useCallback((e: maplibregl.MapMouseEvent) => {
    const map = mapRef.current;
    if (!map || !regionA) return;

    if (draggingRef.current) {
      // 正在拖拽幽灵
      const newLng = e.lngLat.lng + dragOffsetRef.current[0];
      const newLat = Math.max(-82, Math.min(82, e.lngLat.lat + dragOffsetRef.current[1]));
      moveGhostTo(map, [newLng, newLat]);
      return;
    }

    // 未拖拽状态：仅做精确 Hit Test
    let isHit = false;
    if (ghostCenterRef.current) {
      // 1. 手柄距离测试
      const centerPt = map.project(ghostCenterRef.current);
      const pxDist = Math.hypot(e.point.x - centerPt.x, e.point.y - centerPt.y);
      if (pxDist <= 28) isHit = true;
    }

    if (!isHit && ghostFeatureRef.current) {
      // 2. 射线法多边形几何检测
      isHit = pointInFeature([e.lngLat.lng, e.lngLat.lat], ghostFeatureRef.current);
    }

    hoveringGhostRef.current = isHit;
    map.getCanvas().style.cursor = isHit ? 'grab' : '';
  }, [moveGhostTo, regionA]);

  const handleMapMouseDown = useCallback((e: maplibregl.MapMouseEvent) => {
    const map = mapRef.current;
    if (!map || !regionA) return;

    // 关键修复：未点击幽灵图层时直接放行，绝不阻断地图正常平移/缩放！
    if (!hoveringGhostRef.current) return;

    e.preventDefault?.();
    map.dragPan.disable();
    draggingRef.current = true;
    setDragging(true);
    map.getCanvas().style.cursor = 'grabbing';

    const currentCenter = ghostCenterRef.current ?? [e.lngLat.lng, e.lngLat.lat];
    // 记录抓取偏移量，避免中心突变瞬移
    dragOffsetRef.current = [currentCenter[0] - e.lngLat.lng, currentCenter[1] - e.lngLat.lat];
  }, [regionA]);

  const handleMapMouseUp = useCallback((e: maplibregl.MapMouseEvent) => {
    const map = mapRef.current;
    if (!map) return;

    if (draggingRef.current) {
      draggingRef.current = false;
      setDragging(false);
      map.dragPan.enable();

      if (regionA && ghostCenterRef.current) {
        tool.setGhostCenter(ghostCenterRef.current);
      }

      let isHit = false;
      if (ghostCenterRef.current) {
        const centerPt = map.project(ghostCenterRef.current);
        const pxDist = Math.hypot(e.point.x - centerPt.x, e.point.y - centerPt.y);
        if (pxDist <= 28) isHit = true;
      }
      if (!isHit && ghostFeatureRef.current) {
        isHit = pointInFeature([e.lngLat.lng, e.lngLat.lat], ghostFeatureRef.current);
      }
      hoveringGhostRef.current = isHit;
      map.getCanvas().style.cursor = isHit ? 'grab' : '';
    }
  }, [regionA, tool]);

  // 注册地图事件监听
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !regionA) return;

    map.on('mousemove', handleMapMouseMove);
    map.on('mousedown', handleMapMouseDown);
    map.on('mouseup', handleMapMouseUp);

    return () => {
      map.off('mousemove', handleMapMouseMove);
      map.off('mousedown', handleMapMouseDown);
      map.off('mouseup', handleMapMouseUp);
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
    };
  }, [handleMapMouseDown, handleMapMouseMove, handleMapMouseUp, regionA]);

  // 快捷跳转预设
  const jumpToPreset = useCallback((preset: 'refB' | 'equator' | 'highLat' | 'reset') => {
    const map = mapRef.current;
    if (!map || !regionA) return;

    let targetCenter: [number, number];
    const nativeCenter = featureLatCenter(regionA.feature).center;

    if (preset === 'refB' && regionB) {
      targetCenter = featureLatCenter(regionB.feature).center;
    } else if (preset === 'equator') {
      const curLng = ghostCenterRef.current ? ghostCenterRef.current[0] : nativeCenter[0];
      targetCenter = [curLng, 0];
    } else if (preset === 'highLat') {
      const curLng = ghostCenterRef.current ? ghostCenterRef.current[0] : nativeCenter[0];
      targetCenter = [curLng, 65];
    } else {
      targetCenter = nativeCenter;
    }

    moveGhostTo(map, targetCenter);

    if (regionB) {
      fitFeatures(map, [regionB.feature, ghostFeatureRef.current!]);
    } else {
      fitFeatures(map, [regionA.feature, ghostFeatureRef.current!]);
    }
  }, [moveGhostTo, regionA, regionB]);

  // 计算真实测地面积 (km²)
  const areaA = useMemo(() => {
    if (!regionA) return null;
    return calculateGeodesicAreaKm2(regionA.feature);
  }, [regionA]);

  const areaB = useMemo(() => {
    if (!regionB) return null;
    return calculateGeodesicAreaKm2(regionB.feature);
  }, [regionB]);

  // ---- 面积与投影比较 ----
  const compare = useMemo(() => {
    if (!regionA) return null;

    const { lat: latA } = featureLatCenter(regionA.feature);
    const cosA = Math.cos((latA * Math.PI) / 180);
    const mercatorDistortionA = (1 / (cosA * cosA)).toFixed(2);

    const ghostLat = ghostCenterRef.current?.[1] ?? latA;
    const ghostScale = mercatorScale(latA, ghostLat);

    if (!regionB) {
      return {
        latA: latA.toFixed(1),
        latB: null,
        areaAFormatted: areaA !== null ? formatGeodesicArea(areaA) : '-',
        areaBFormatted: null,
        ratioPercent: null,
        mercatorDistortionA,
        mercatorDistortionB: null,
        scaleAtoB: null,
        ghostScale: ghostScale.toFixed(3),
        ghostLat: ghostLat.toFixed(1),
      };
    }

    const { lat: latB } = featureLatCenter(regionB.feature);
    const cosB = Math.cos((latB * Math.PI) / 180);
    const mercatorDistortionB = (1 / (cosB * cosB)).toFixed(2);
    const scale = mercatorScale(latA, latB);

    const areaKm2A = areaA ?? 0;
    const areaKm2B = areaB ?? 0;
    const ratioPercent = areaKm2B > 0 ? ((areaKm2A / areaKm2B) * 100).toFixed(1) : null;

    return {
      latA: latA.toFixed(1),
      latB: latB.toFixed(1),
      areaAFormatted: formatGeodesicArea(areaKm2A),
      areaBFormatted: formatGeodesicArea(areaKm2B),
      ratioPercent,
      mercatorDistortionA,
      mercatorDistortionB,
      scaleAtoB: scale.toFixed(3),
      ghostScale: ghostScale.toFixed(3),
      ghostLat: ghostLat.toFixed(1),
    };
  }, [regionA, regionB, areaA, areaB, dragging, dragPos]);

  return (
    <div style={{
      position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
      zIndex: 2000, width: 440, maxWidth: '95vw',
      background: 'rgba(10,12,22,0.92)', backdropFilter: 'blur(16px)',
      borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
      padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    }}>
      {/* 标题 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 6,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>📐</span> <span>真实大小比较 (True Size)</span>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          支持全球国家 & 中国省份
        </div>
      </div>

      {/* 区域 A 选择 */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <label style={{ fontSize: 11, color: '#4fc3f7', fontWeight: 500 }}>
            区域 A（幽灵，可拖动跨纬度对比）
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'country', 'province'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTabA(t)}
                style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4, border: 'none',
                  background: tabA === t ? '#4fc3f7' : 'rgba(255,255,255,0.06)',
                  color: tabA === t ? '#000' : 'rgba(255,255,255,0.6)',
                  cursor: 'pointer', fontWeight: tabA === t ? 600 : 400,
                }}
              >
                {t === 'all' ? '全部' : t === 'country' ? '国家' : '省份'}
              </button>
            ))}
          </div>
        </div>
        <input
          value={queryA}
          onChange={(e) => changeQueryA(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitQueryA();
          }}
          placeholder="搜索国家或中国省份（如: 新疆, 日本, 德国...）"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6, color: '#fff', padding: '6px 10px', fontSize: 12,
            outline: 'none',
          }}
        />
        {queryA && !regionA && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
            background: 'rgba(12,16,28,0.96)', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)',
            maxHeight: 180, overflow: 'auto', marginTop: 3,
            boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
          }}>
            {suggestionsA.map((c) => (
              <div
                key={c.iso}
                onClick={() => selectA(c)}
                style={{
                  padding: '6px 10px', cursor: 'pointer', fontSize: 12,
                  color: 'rgba(255,255,255,0.85)',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(79,195,247,0.12)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>{c.nameZh}</span>{' '}
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{c.name}</span>
                </div>
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 3,
                  background: c.type === 'province' ? 'rgba(239,83,80,0.2)' : 'rgba(79,195,247,0.2)',
                  color: c.type === 'province' ? '#ef5350' : '#4fc3f7',
                }}>
                  {c.type === 'province' ? '🇨🇳 省份' : '🌐 国家'}
                </span>
              </div>
            ))}
          </div>
        )}
        {regionA && (
          <div style={{ fontSize: 11, color: '#4fc3f7', marginTop: 3 }}>
            ✅ 已选：{regionA.nameZh || regionA.name} ({regionA.type === 'province' ? '中国省份' : '国家'})
          </div>
        )}
      </div>

      {/* 区域 B 选择 */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <label style={{ fontSize: 11, color: '#ffb74d', fontWeight: 500 }}>
            区域 B（参考，固定在地图上）
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'country', 'province'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTabB(t)}
                style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4, border: 'none',
                  background: tabB === t ? '#ffb74d' : 'rgba(255,255,255,0.06)',
                  color: tabB === t ? '#000' : 'rgba(255,255,255,0.6)',
                  cursor: 'pointer', fontWeight: tabB === t ? 600 : 400,
                }}
              >
                {t === 'all' ? '全部' : t === 'country' ? '国家' : '省份'}
              </button>
            ))}
          </div>
        </div>
        <input
          value={queryB}
          onChange={(e) => changeQueryB(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitQueryB();
          }}
          placeholder="搜索国家或中国省份..."
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6, color: '#fff', padding: '6px 10px', fontSize: 12,
            outline: 'none',
          }}
        />
        {queryB && !regionB && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
            background: 'rgba(12,16,28,0.96)', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)',
            maxHeight: 180, overflow: 'auto', marginTop: 3,
            boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
          }}>
            {suggestionsB.map((c) => (
              <div
                key={c.iso}
                onClick={() => selectB(c)}
                style={{
                  padding: '6px 10px', cursor: 'pointer', fontSize: 12,
                  color: 'rgba(255,255,255,0.85)',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,183,77,0.12)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>{c.nameZh}</span>{' '}
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{c.name}</span>
                </div>
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 3,
                  background: c.type === 'province' ? 'rgba(239,83,80,0.2)' : 'rgba(255,183,77,0.2)',
                  color: c.type === 'province' ? '#ef5350' : '#ffb74d',
                }}>
                  {c.type === 'province' ? '🇨🇳 省份' : '🌐 国家'}
                </span>
              </div>
            ))}
          </div>
        )}
        {regionB && (
          <div style={{ fontSize: 11, color: '#ffb74d', marginTop: 3 }}>
            ✅ 已选：{regionB.nameZh || regionB.name} ({regionB.type === 'province' ? '中国省份' : '国家'})
          </div>
        )}
      </div>

      {/* 快捷跳转与操作提示 */}
      {regionA && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{
            fontSize: 10, color: dragging ? '#81c784' : 'rgba(255,255,255,0.5)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>
              {dragging
                ? '🖐 正在拖拽幽灵图层...松手固定'
                : '💡 鼠标放至幽灵图层或手柄上直接拖拽；地图其他区域可自由平移'}
            </span>
          </div>

          {/* 预设跳转按钮组 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {regionB && (
              <button
                type="button"
                onClick={() => jumpToPreset('refB')}
                style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 4,
                  background: 'rgba(255,183,77,0.18)', border: '1px solid rgba(255,183,77,0.3)',
                  color: '#ffb74d', cursor: 'pointer',
                }}
              >
                🎯 对齐参考区域
              </button>
            )}
            <button
              type="button"
              onClick={() => jumpToPreset('equator')}
              style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 4,
                background: 'rgba(79,195,247,0.15)', border: '1px solid rgba(79,195,247,0.25)',
                color: '#4fc3f7', cursor: 'pointer',
              }}
            >
              🌐 移至赤道 (0°)
            </button>
            <button
              type="button"
              onClick={() => jumpToPreset('highLat')}
              style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 4,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff', cursor: 'pointer',
              }}
            >
              ❄️ 移至高纬度 (65°N)
            </button>
            <button
              type="button"
              onClick={() => jumpToPreset('reset')}
              style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 4,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
              }}
            >
              ↩️ 恢复原位
            </button>
          </div>
        </div>
      )}

      {/* 对比信息 */}
      {compare && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8,
          fontSize: 11,
        }}>
          {/* 真实测地面积 */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px',
            background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px',
          }}>
            <div>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{regionA!.nameZh} 真实面积</span>
              <div style={{ color: '#4fc3f7', fontWeight: 600, fontSize: 12 }}>
                {compare.areaAFormatted}
              </div>
            </div>
            {regionB && (
              <div>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{regionB.nameZh} 真实面积</span>
                <div style={{ color: '#ffb74d', fontWeight: 600, fontSize: 12 }}>
                  {compare.areaBFormatted}
                </div>
              </div>
            )}
          </div>

          {/* 面积相对比率 */}
          {regionB && compare.ratioPercent && (
            <div style={{
              background: 'rgba(79, 195, 247, 0.08)', border: '1px solid rgba(79, 195, 247, 0.2)',
              borderRadius: 6, padding: '5px 8px', color: '#e0f7fa', fontSize: 11,
            }}>
              📊 真实占比：<b>{regionA!.nameZh}</b> 仅相当于 <b>{regionB.nameZh}</b> 的{' '}
              <b style={{ color: '#4fc3f7' }}>{compare.ratioPercent}%</b>
            </div>
          )}

          {/* 维度与墨卡托失真 */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px',
            color: 'rgba(255,255,255,0.6)', fontSize: 10,
          }}>
            <span>{regionA!.nameZh} 原生纬度</span>
            <b style={{ color: '#4fc3f7' }}>{compare.latA}° (墨卡托膨胀 ~{compare.mercatorDistortionA}x)</b>
            {regionB && compare.latB && (
              <>
                <span>{regionB.nameZh} 中心纬度</span>
                <b style={{ color: '#ffb74d' }}>{compare.latB}° (墨卡托膨胀 ~{compare.mercatorDistortionB}x)</b>
              </>
            )}
            <span>幽灵图层当前纬度</span>
            <b style={{ color: '#81c784' }}>{compare.ghostLat}° (缩放因子 {compare.ghostScale}x)</b>
          </div>
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
  return suggestions.find((c) =>
    c.name.toLocaleLowerCase() === normalized ||
    c.nameZh === query.trim() ||
    c.nameZh.includes(query.trim())
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
    padding: { top: 72, right: 64, bottom: 220, left: 280 },
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
