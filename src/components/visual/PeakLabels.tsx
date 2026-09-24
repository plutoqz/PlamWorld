// components/visual/PeakLabels.tsx — 峰顶识别交互面板
//
// 点击地图放置视点 → 检索真实山峰与通视判定 → 屏幕空间碰撞避让标签 → 视线射线与朝向漫游

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  AlertCircle,
  LoaderCircle,
  MousePointer2,
  Eye,
  EyeOff,
  Compass,
  ArrowUpRight,
} from 'lucide-react';
import type { PeakFinderTool, PeakInfo } from '@tools/peak-finder.tool';
import type { LngLat } from '@core/types';

interface PeakLabelsProps {
  tool: PeakFinderTool;
}

const SIGHTLINE_SOURCE_ID = 'peak-finder-sightline-src';
const SIGHTLINE_LAYER_ID = 'peak-finder-sightline-layer';

export function PeakLabels({ tool }: PeakLabelsProps) {
  const [viewPoint, setViewPoint] = useState<LngLat | null>(tool.viewPoint);
  const [peaks, setPeaks] = useState<PeakInfo[]>(tool.peaks);
  const [observerHeight, setObserverHeight] = useState(tool.observerHeight);
  const [observerElevation, setObserverElevation] = useState(tool.observerElevation);
  const [radius, setRadius] = useState(tool.searchRadius);
  const [searching, setSearching] = useState(tool.searching);

  // 筛选与排序
  const [visibleOnly, setVisibleOnly] = useState(false);
  const [sectorFilter, setSectorFilter] = useState<'ALL' | 'N' | 'E' | 'S' | 'W'>('ALL');
  const [sortBy, setSortBy] = useState<'dist' | 'elevation'>('dist');
  const [hoveredPeak, setHoveredPeak] = useState<PeakInfo | null>(null);

  const markersRef = useRef<maplibregl.Marker[]>([]);
  const vpMarkerRef = useRef<maplibregl.Marker | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // 监听工具状态同步
  useEffect(() => {
    tool.setOnStateChange(() => {
      setViewPoint(tool.viewPoint);
      setPeaks([...tool.peaks]);
      setSearching(tool.searching);
      setObserverElevation(tool.observerElevation);
    });
    return () => tool.setOnStateChange(null);
  }, [tool]);

  // 初始化地图引用与视线射线图层
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map | null;
    if (!map) return;
    mapRef.current = map;

    const setupSightlineLayer = () => {
      if (!map.getSource(SIGHTLINE_SOURCE_ID)) {
        map.addSource(SIGHTLINE_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      if (!map.getLayer(SIGHTLINE_LAYER_ID)) {
        map.addLayer({
          id: SIGHTLINE_LAYER_ID,
          type: 'line',
          source: SIGHTLINE_SOURCE_ID,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2.5,
            'line-dasharray': [3, 2],
            'line-opacity': 0.9,
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      setupSightlineLayer();
    } else {
      map.once('load', setupSightlineLayer);
    }

    return () => {
      if (map.getLayer(SIGHTLINE_LAYER_ID)) map.removeLayer(SIGHTLINE_LAYER_ID);
      if (map.getSource(SIGHTLINE_SOURCE_ID)) map.removeSource(SIGHTLINE_SOURCE_ID);
    };
  }, [tool]);

  // 视线射线渲染
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(SIGHTLINE_SOURCE_ID)) return;
    const source = map.getSource(SIGHTLINE_SOURCE_ID) as maplibregl.GeoJSONSource;

    if (viewPoint && hoveredPeak) {
      source.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              color: hoveredPeak.visible ? '#10b981' : '#f43f5e',
            },
            geometry: {
              type: 'LineString',
              coordinates: [viewPoint, [hoveredPeak.lng, hoveredPeak.lat]],
            },
          },
        ],
      });
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [hoveredPeak, viewPoint]);

  // 飞向山峰
  const handleGoTo = useCallback((peak: PeakInfo) => {
    const engine = tool.engine;
    if (engine) {
      engine.flyTo([peak.lng, peak.lat], 13, { duration: 1800 });
    }
  }, [tool]);

  // 从视点朝向山峰远眺
  const handleLookTowards = useCallback((peak: PeakInfo) => {
    const map = mapRef.current;
    if (!map || !viewPoint) return;
    map.easeTo({
      center: viewPoint,
      bearing: peak.bearing,
      pitch: 62,
      zoom: 11.5,
      duration: 1600,
    });
  }, [viewPoint]);

  // 飞回视点
  const handleGoToViewPoint = useCallback(() => {
    const engine = tool.engine;
    if (engine && viewPoint) {
      engine.flyTo(viewPoint, 12, { duration: 1200 });
    }
  }, [tool, viewPoint]);

  // 点击地图设置视点
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const native = engine.getNative() as {
      on: (e: string, cb: (ev: unknown) => void) => void;
      off: (e: string, cb: (ev: unknown) => void) => void;
    } | null;
    if (!native) return;

    const handler = (e: unknown) => {
      const ev = e as { lngLat?: { lng: number; lat: number } };
      if (ev.lngLat) {
        tool.setViewPoint([ev.lngLat.lng, ev.lngLat.lat]);
      }
    };
    native.on('click', handler);
    return () => { native.off('click', handler); };
  }, [tool]);

  // 过滤与排序后的峰顶列表
  const filteredPeaks = useMemo(() => {
    let result = peaks;

    if (visibleOnly) {
      result = result.filter((p) => p.visible);
    }

    if (sectorFilter !== 'ALL') {
      result = result.filter((p) => {
        const deg = (p.bearing + 360) % 360;
        if (sectorFilter === 'N') return deg >= 315 || deg < 45;
        if (sectorFilter === 'E') return deg >= 45 && deg < 135;
        if (sectorFilter === 'S') return deg >= 135 && deg < 225;
        if (sectorFilter === 'W') return deg >= 225 && deg < 315;
        return true;
      });
    }

    const sorted = [...result];
    if (sortBy === 'elevation') {
      sorted.sort((a, b) => b.elevation - a.elevation);
    } else {
      sorted.sort((a, b) => a.distance - b.distance);
    }
    return sorted;
  }, [peaks, visibleOnly, sectorFilter, sortBy]);

  // 渲染视点 Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (vpMarkerRef.current) {
      vpMarkerRef.current.remove();
      vpMarkerRef.current = null;
    }

    if (viewPoint) {
      const el = document.createElement('div');
      el.style.cssText = `
        width: 18px; height: 18px; border-radius: 50%;
        background: #facc15;
        border: 3px solid #0f172a;
        box-shadow: 0 0 0 3px rgba(250,204,21,0.35), 0 2px 8px rgba(0,0,0,0.5);
        cursor: pointer;
      `;
      el.title = `观察视点: ${viewPoint[0].toFixed(3)}°E, ${viewPoint[1].toFixed(3)}°N`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        handleGoToViewPoint();
      });

      vpMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(viewPoint)
        .addTo(map);
    }

    return () => {
      if (vpMarkerRef.current) {
        vpMarkerRef.current.remove();
        vpMarkerRef.current = null;
      }
    };
  }, [handleGoToViewPoint, viewPoint]);

  // 屏幕空间碰撞避让与标签渲染 (Decluttering LOD)
  const updateMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // 按优先级排序：可见山峰优先，其次按海拔由高到低，确保主峰拥有标签霸权
    const priorityList = [...filteredPeaks].sort((a, b) => {
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      return b.elevation - a.elevation;
    });

    const occupiedBoxes: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const BADGE_WIDTH = 100;
    const BADGE_HEIGHT = 28;

    priorityList.forEach((peak) => {
      const pt = map.project([peak.lng, peak.lat]);

      // 检测与已放置完整标签的碰撞
      const box = {
        x1: pt.x - BADGE_WIDTH / 2,
        y1: pt.y - BADGE_HEIGHT,
        x2: pt.x + BADGE_WIDTH / 2,
        y2: pt.y,
      };

      let collides = false;
      for (const b of occupiedBoxes) {
        if (!(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2)) {
          collides = true;
          break;
        }
      }

      const el = document.createElement('button');
      el.type = 'button';

      if (!collides) {
        // 无碰撞：渲染完整峰顶徽章
        occupiedBoxes.push(box);
        const bg = peak.visible
          ? peak.source === 'osm'
            ? '#059669'
            : peak.source === 'dem'
              ? '#b45309'
              : '#2563eb'
          : 'rgba(30, 41, 59, 0.85)';

        const borderColor = peak.visible ? '#ffffff' : 'rgba(255,255,255,0.35)';

        el.style.cssText = `
          border: 1.5px solid ${borderColor};
          border-radius: 5px;
          background: ${bg};
          color: #fff;
          padding: 3px 7px;
          font: 600 11px system-ui, -apple-system, sans-serif;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(0,0,0,0.55);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          opacity: ${peak.visible ? '1' : '0.75'};
          transition: transform 0.15s, box-shadow 0.15s;
        `;
        el.innerHTML = `
          <span>⛰️</span>
          <span>${peak.name}</span>
          <span style="opacity:0.85;font-weight:400;font-size:10px;">${Math.round(peak.elevation)}m</span>
          ${!peak.visible ? '<span style="font-size:9px;opacity:0.8;">[遮挡]</span>' : ''}
        `;
      } else {
        // 发生碰撞：降级为紧凑山峰微点，避免视觉污染
        el.style.cssText = `
          width: 8px; height: 8px; border-radius: 50%;
          background: ${peak.visible ? '#10b981' : '#94a3b8'};
          border: 1.5px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          cursor: pointer;
          padding: 0;
          opacity: 0.85;
          transition: transform 0.15s;
        `;
        el.title = `${peak.name} (${Math.round(peak.elevation)}m) - ${peak.visible ? '可见' : '遮挡'}`;
      }

      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.1)';
        setHoveredPeak(peak);
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)';
        setHoveredPeak(null);
      });
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        handleGoTo(peak);
      });

      markersRef.current.push(
        new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -4] })
          .setLngLat([peak.lng, peak.lat])
          .addTo(map),
      );
    });
  }, [filteredPeaks, handleGoTo]);

  // 地图视口变化时重新做碰撞避让
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    updateMarkers();

    const handler = () => updateMarkers();
    map.on('moveend', handler);
    return () => {
      map.off('moveend', handler);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [updateMarkers]);

  const bearingLabel = (deg: number) => {
    const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    return dirs[Math.round(deg / 45) % 8];
  };

  const visibleCount = peaks.filter((p) => p.visible).length;
  const hiddenCount = peaks.length - visibleCount;

  return (
    <div className="pw-panel-stack" style={{ gap: 10 }}>
      {/* 观察点高程与高度控制 */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px',
        display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>视点站高</span>
          <span style={{ color: '#facc15', fontWeight: 600 }}>
            {viewPoint
              ? `${observerElevation}m (地表) + ${observerHeight}m (视线) = ${observerElevation + observerHeight}m`
              : '未选定视点'}
          </span>
        </div>

        <div className="pw-control-row" style={{ margin: 0 }}>
          <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>人眼视高</label>
          <input
            type="range" min={1} max={100} value={observerHeight}
            onChange={(e) => {
              const h = Number(e.target.value);
              setObserverHeight(h);
              tool.setObserverHeight(h);
            }}
            style={{ width: '100%' }}
          />
          <output style={{ fontSize: 11, minWidth: 36 }}>{observerHeight} m</output>
        </div>

        <div className="pw-control-row" style={{ margin: 0 }}>
          <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>搜索半径</label>
          <input
            type="range" min={10} max={200} value={radius}
            onChange={(e) => {
              const r = Number(e.target.value);
              setRadius(r);
              tool.setSearchRadius(r);
            }}
            style={{ width: '100%' }}
          />
          <output style={{ fontSize: 11, minWidth: 42 }}>{radius} km</output>
        </div>
      </div>

      {/* 提示信息 */}
      {!viewPoint && (
        <div className="pw-panel-status" style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
          <MousePointer2 size={14} color="#facc15" />
          <span>点击地图任意位置放置观察视点</span>
        </div>
      )}

      {viewPoint && searching && (
        <div className="pw-panel-status is-warning" style={{ borderRadius: 6 }}>
          <LoaderCircle size={14} className="pw-spin" />
          <span>正在检索周边真实山峰并进行地形遮挡通视分析...</span>
        </div>
      )}

      {viewPoint && !searching && peaks.length === 0 && (
        <div className="pw-panel-status is-danger" style={{ borderRadius: 6 }}>
          <AlertCircle size={14} />
          <span>半径 {radius}km 内未检索到山峰数据</span>
        </div>
      )}

      {/* 筛选与统计工具条 */}
      {peaks.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
              共发现 <b>{peaks.length}</b> 座山峰 (可见: <b style={{ color: '#10b981' }}>{visibleCount}</b>, 遮挡: <b style={{ color: '#94a3b8' }}>{hiddenCount}</b>)
            </span>
            <button
              type="button"
              onClick={() => setVisibleOnly(!visibleOnly)}
              style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 4,
                border: '1px solid rgba(255,255,255,0.12)',
                background: visibleOnly ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
                color: visibleOnly ? '#10b981' : 'rgba(255,255,255,0.7)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {visibleOnly ? <Eye size={12} /> : <EyeOff size={12} />}
              <span>{visibleOnly ? '仅看可见' : '显示全部'}</span>
            </button>
          </div>

          {/* 方位筛选与排序 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['ALL', 'N', 'E', 'S', 'W'] as const).map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setSectorFilter(sec)}
                  style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 3, border: 'none',
                    background: sectorFilter === sec ? '#38bdf8' : 'rgba(255,255,255,0.06)',
                    color: sectorFilter === sec ? '#000' : 'rgba(255,255,255,0.6)',
                    cursor: 'pointer', fontWeight: sectorFilter === sec ? 600 : 400,
                  }}
                >
                  {sec === 'ALL' ? '全向' : sec === 'N' ? '偏北' : sec === 'E' ? '偏东' : sec === 'S' ? '偏南' : '偏西'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => setSortBy('dist')}
                style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 3, border: 'none',
                  background: sortBy === 'dist' ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: sortBy === 'dist' ? '#fff' : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                }}
              >
                距离
              </button>
              <button
                type="button"
                onClick={() => setSortBy('elevation')}
                style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 3, border: 'none',
                  background: sortBy === 'elevation' ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: sortBy === 'elevation' ? '#fff' : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                }}
              >
                海拔
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 山峰列表 */}
      {filteredPeaks.length > 0 && (
        <div style={{
          maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
          paddingRight: 2,
        }}>
          {filteredPeaks.map((p, i) => (
            <PeakCard
              key={`${p.lat}-${p.lng}-${i}`}
              peak={p}
              bearingLabel={bearingLabel}
              onFly={() => handleGoTo(p)}
              onLook={() => handleLookTowards(p)}
              onHover={(isHover) => setHoveredPeak(isHover ? p : null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PeakCard({
  peak,
  bearingLabel,
  onFly,
  onLook,
  onHover,
}: {
  peak: PeakInfo;
  bearingLabel: (d: number) => string;
  onFly: () => void;
  onLook: () => void;
  onHover: (hover: boolean) => void;
}) {
  const sourceLabel =
    peak.source === 'osm'
      ? 'OSM 真实山峰'
      : peak.source === 'dem'
        ? 'DEM 区域最高点'
        : '名山数据库';

  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 10px', borderRadius: 6,
        background: peak.visible ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.06)',
        opacity: peak.visible ? 1 : 0.65,
        gap: 8,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {peak.name}
          </span>
          <span style={{
            fontSize: 9, padding: '1px 5px', borderRadius: 3,
            background: peak.visible ? 'rgba(16,185,129,0.18)' : 'rgba(148,163,184,0.18)',
            color: peak.visible ? '#10b981' : '#94a3b8',
          }}>
            {peak.visible ? '可见' : '遮挡'}
          </span>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span>海拔 <b>{Math.round(peak.elevation)}m</b></span>
          <span>·</span>
          <span>距离 <b>{peak.distance.toFixed(1)}km</b></span>
          <span>·</span>
          <span>{bearingLabel(peak.bearing)} ({Math.round(peak.bearing)}°)</span>
          {peak.pitchAngle !== undefined && (
            <>
              <span>·</span>
              <span style={{ color: peak.pitchAngle >= 0 ? '#38bdf8' : '#94a3b8' }}>
                仰角 {peak.pitchAngle > 0 ? `+${peak.pitchAngle}°` : `${peak.pitchAngle}°`}
              </span>
            </>
          )}
        </div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>
          {sourceLabel}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onLook}
          title="从视点朝向此山峰远眺 (第一人称观察)"
          style={{
            background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)',
            borderRadius: 4, padding: '4px 6px', color: '#38bdf8', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
          }}
        >
          <Compass size={12} />
          <span>远眺</span>
        </button>
        <button
          type="button"
          onClick={onFly}
          title="飞向山峰上空"
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4, padding: '4px 6px', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
          }}
        >
          <ArrowUpRight size={12} />
          <span>定位</span>
        </button>
      </div>
    </div>
  );
}
