// components/panels/LiteraryPanel.tsx — 文学地图面板 (v0.6)
//
// 山海经首发实现：锚点地图（带地名标注与卡片） / 叙事路线（完整行进动画与叙事步进） / 异兽图鉴 / 幻想空间（山海神舆图与天圆地方宇宙观）

import { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  RotateCcw,
  ChevronRight,
  Route,
  Sparkles,
  Play,
  Pause,
  Navigation,
} from 'lucide-react';
import type { LiteraryMapTool, LiteraryViewMode } from '../../tools/literary-map.tool';
import { VIEW_LABELS } from '../../tools/literary-map.tool';
import type { AnchorConfidence, AnchorCategory, LiteraryAnchor } from '../../core/literary-map';
import {
  CONFIDENCE_LABELS,
  CONFIDENCE_COLORS,
  groupByConfidence,
  getRealAnchors,
  getFantasyAnchors,
} from '../../core/literary-map';

// ---- constants ----
const ANCHOR_SRC = 'palm-lit-anchor-src';
const ANCHOR_LYR = 'palm-lit-anchor-lyr';
const ANCHOR_LABEL_LYR = 'palm-lit-anchor-label-lyr';
const ROUTE_SRC_PREFIX = 'palm-lit-route-';
const ROUTE_LYR_PREFIX = 'palm-lit-route-lyr-';
const BEACON_SRC = 'palm-lit-beacon-src';
const BEACON_LYR = 'palm-lit-beacon-lyr';
const HIGHLIGHT_SRC = 'palm-lit-hl-src';
const HIGHLIGHT_LYR = 'palm-lit-hl-lyr';

const ANCHOR_ICONS: Partial<Record<AnchorCategory, string>> = {
  mountain: '⛰️',
  river: '🌊',
  lake: '💧',
  country: '🏰',
  creature: '🐉',
  plant: '🌿',
  mineral: '💎',
  character: '👤',
  event: '⚡',
  route: '➡️',
};

interface LiteraryPanelProps {
  tool: LiteraryMapTool;
}

export function LiteraryPanel({ tool }: LiteraryPanelProps) {
  const [view, setView] = useState<LiteraryViewMode>(tool.state.view);
  const [confidenceFilter, setConfidenceFilter] = useState(tool.state.confidenceFilter);
  const [highlightId, setHighlightId] = useState<string | null>(tool.state.highlightAnchorId);
  const [routePlaying, setRoutePlaying] = useState(tool.state.routePlaying);
  const [activeRouteIdx, setActiveRouteIdx] = useState(tool.state.activeRouteIdx);
  const [routeProgress, setRouteProgress] = useState(0); // 0 ~ 1
  const [currentWaypointIdx, setCurrentWaypointIdx] = useState(0);
  const [followCamera, setFollowCamera] = useState(false);
  const [selectedMythical, setSelectedMythical] = useState<LiteraryAnchor | null>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const source = tool.getSource();
  const realAnchors = getRealAnchors(source.anchors);
  const fantasyAnchors = getFantasyAnchors(source.anchors);

  // 状态同步
  useEffect(() => {
    const onStateChange = () => {
      setView(tool.state.view);
      setConfidenceFilter([...tool.state.confidenceFilter]);
      setHighlightId(tool.state.highlightAnchorId);
      setRoutePlaying(tool.state.routePlaying);
      setActiveRouteIdx(tool.state.activeRouteIdx);
    };
    tool.setOnStateChange(onStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool]);

  // 地图初始化与点击事件
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map;
    mapRef.current = map;

    // 点击锚点事件
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [ANCHOR_LYR, ANCHOR_LABEL_LYR].filter((l) => map.getLayer(l)),
      });
      if (features.length > 0) {
        const id = features[0]!.properties?.id as string | undefined;
        if (id) {
          tool.setHighlightAnchor(id);
          const a = source.anchors.find((item) => item.id === id);
          if (a?.realCoord) {
            showAnchorPopup(map, a);
          }
        }
      }
    };

    map.on('click', onClick);

    return () => {
      map.off('click', onClick);
      if (popupRef.current) popupRef.current.remove();
      cleanupAll(map);
    };
  }, [source.anchors, tool]);

  // 显示锚点 Popup
  const showAnchorPopup = useCallback((map: maplibregl.Map, a: LiteraryAnchor) => {
    if (!a.realCoord) return;
    if (popupRef.current) popupRef.current.remove();

    const icon = ANCHOR_ICONS[a.category] ?? '📍';
    const confColor = CONFIDENCE_COLORS[a.confidence];
    const confLabel = CONFIDENCE_LABELS[a.confidence];

    const popup = new maplibregl.Popup({ offset: 12, closeButton: true })
      .setLngLat(a.realCoord)
      .setHTML(`
        <div style="font-family: system-ui, -apple-system, sans-serif; padding: 4px 6px; color: #0f172a; max-width: 250px;">
          <div style="font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: space-between; gap: 6px;">
            <span>${icon} ${a.nameZh || a.name}</span>
            <span style="font-size: 9px; padding: 1px 5px; border-radius: 3px; background: ${confColor}22; color: ${confColor}; border: 1px solid ${confColor}55;">
              ${confLabel}
            </span>
          </div>
          <div style="font-size: 11px; margin-top: 5px; color: #334155; line-height: 1.45; font-style: italic;">
            「${a.description}」
          </div>
          <div style="font-size: 10px; color: #64748b; margin-top: 4px;">
            真实坐标: ${a.realCoord[0].toFixed(2)}°E, ${a.realCoord[1].toFixed(2)}°N
          </div>
        </div>
      `)
      .addTo(map);

    popupRef.current = popup;
  }, []);

  // 渲染真实锚点与路线图层
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    cleanupAnchors(map);

    if (view === 'anchors' || view === 'routes') {
      const filtered = realAnchors.filter((a) => confidenceFilter.includes(a.confidence));

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: filtered.map((a) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: a.realCoord!,
          },
          properties: {
            id: a.id,
            name: a.nameZh ?? a.name,
            confidence: a.confidence,
            category: a.category,
            description: a.description,
          },
        })),
      };

      map.addSource(ANCHOR_SRC, { type: 'geojson', data: geojson });

      // 圆形标记图层
      map.addLayer({
        id: ANCHOR_LYR,
        source: ANCHOR_SRC,
        type: 'circle',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4.5, 8, 8, 12, 12],
          'circle-color': [
            'match',
            ['get', 'confidence'],
            'exact',
            CONFIDENCE_COLORS.exact,
            'approximate',
            CONFIDENCE_COLORS.approximate,
            'conjectural',
            CONFIDENCE_COLORS.conjectural,
            CONFIDENCE_COLORS.mythical,
          ],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.9,
        },
      });

      // 文本标注图层 (解决此前地图上只有纯色圆点盲点的严重缺陷)
      map.addLayer({
        id: ANCHOR_LABEL_LYR,
        source: ANCHOR_SRC,
        type: 'symbol',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 8, 12],
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#f8fafc',
          'text-halo-color': '#0f172a',
          'text-halo-width': 2,
        },
      });

      // 悬停光标
      map.on('mouseenter', ANCHOR_LYR, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', ANCHOR_LYR, () => {
        map.getCanvas().style.cursor = '';
      });

      // 高亮锚点图层
      if (highlightId) {
        const hlAnchor = realAnchors.find((a) => a.id === highlightId);
        if (hlAnchor?.realCoord) {
          map.addSource(HIGHLIGHT_SRC, {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: hlAnchor.realCoord },
                  properties: { id: hlAnchor.id },
                },
              ],
            },
          });
          map.addLayer({
            id: HIGHLIGHT_LYR,
            source: HIGHLIGHT_SRC,
            type: 'circle',
            paint: {
              'circle-radius': 14,
              'circle-color': CONFIDENCE_COLORS[hlAnchor.confidence],
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 3,
              'circle-opacity': 0.85,
            },
          });
        }
      }
    }

    // 渲染路线
    if (view === 'routes') {
      source.routes?.forEach((route, ri) => {
        if (ri !== activeRouteIdx) return;
        const coords = route.anchorIds
          .map((id) => realAnchors.find((a) => a.id === id))
          .filter(Boolean)
          .map((a) => a!.realCoord!);

        if (coords.length < 2) return;

        const srcId = `${ROUTE_SRC_PREFIX}${route.id}`;
        const lyrId = `${ROUTE_LYR_PREFIX}${route.id}`;

        map.addSource(srcId, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: coords },
                properties: { id: route.id, name: route.nameZh },
              },
            ],
          },
        });
        map.addLayer({
          id: lyrId,
          source: srcId,
          type: 'line',
          paint: {
            'line-color': '#f59e0b',
            'line-width': 3.5,
            'line-opacity': 0.85,
            'line-dasharray': [4, 2],
          },
        });
      });
    }
  }, [view, confidenceFilter, highlightId, activeRouteIdx, realAnchors, source.routes]);

  // 叙事路线行进动画循环
  useEffect(() => {
    const map = mapRef.current;
    if (!map || view !== 'routes' || !source.routes) return;

    const currentRoute = source.routes[activeRouteIdx];
    if (!currentRoute) return;

    const routeAnchors = currentRoute.anchorIds
      .map((id) => realAnchors.find((a) => a.id === id))
      .filter((a): a is LiteraryAnchor => a !== undefined && a.realCoord !== undefined);

    if (routeAnchors.length < 2) return;
    const coords = routeAnchors.map((a) => a.realCoord!);

    // 计算分段距离
    const segLengths: number[] = [];
    let totalLen = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i]!;
      const p2 = coords[i + 1]!;
      const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      segLengths.push(dist);
      totalLen += dist;
    }

    // 设置行进光标 Source & Layer
    if (!map.getSource(BEACON_SRC)) {
      map.addSource(BEACON_SRC, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: coords[0]! },
              properties: {},
            },
          ],
        },
      });
    }

    if (!map.getLayer(BEACON_LYR)) {
      map.addLayer({
        id: BEACON_LYR,
        source: BEACON_SRC,
        type: 'circle',
        paint: {
          'circle-radius': 9,
          'circle-color': '#f59e0b',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2.5,
        },
      });
    }

    if (!routePlaying) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    let startTimestamp: number | null = null;
    const DURATION_MS = 14000; // 14秒走完全程

    const step = (ts: number) => {
      if (!startTimestamp) startTimestamp = ts;
      const elapsed = ts - startTimestamp;
      const progress = (elapsed % DURATION_MS) / DURATION_MS;
      setRouteProgress(progress);

      // 根据进度插值计算当前经纬度坐标
      const targetDist = progress * totalLen;
      let accum = 0;
      let curPoint: [number, number] = coords[0]!;
      let waypointIdx = 0;

      for (let i = 0; i < segLengths.length; i++) {
        const seg = segLengths[i]!;
        if (accum + seg >= targetDist) {
          waypointIdx = i;
          const fraction = (targetDist - accum) / seg;
          curPoint = [
            coords[i]![0] + (coords[i + 1]![0] - coords[i]![0]) * fraction,
            coords[i]![1] + (coords[i + 1]![1] - coords[i]![1]) * fraction,
          ];
          break;
        }
        accum += seg;
      }

      setCurrentWaypointIdx(waypointIdx);

      // 更新 Beacon 数据
      const bSrc = map.getSource(BEACON_SRC) as maplibregl.GeoJSONSource | undefined;
      if (bSrc) {
        bSrc.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: curPoint },
              properties: {},
            },
          ],
        });
      }

      if (followCamera) {
        map.easeTo({ center: curPoint, duration: 100 });
      }

      animFrameRef.current = requestAnimationFrame(step);
    };

    animFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (map.getLayer(BEACON_LYR)) map.removeLayer(BEACON_LYR);
      if (map.getSource(BEACON_SRC)) map.removeSource(BEACON_SRC);
    };
  }, [view, routePlaying, activeRouteIdx, source.routes, realAnchors, followCamera]);

  // 切换置信度筛选
  function toggleConf(c: AnchorConfidence) {
    if (confidenceFilter.includes(c)) {
      tool.setConfidenceFilter(confidenceFilter.filter((f) => f !== c));
    } else {
      tool.setConfidenceFilter([...confidenceFilter, c]);
    }
  }

  // 锚点分组
  const groups = groupByConfidence(source.anchors);
  const hlAnchor = source.anchors.find((a) => a.id === highlightId);
  const currentRoute = source.routes?.[activeRouteIdx];
  const routeAnchors = currentRoute
    ? currentRoute.anchorIds
        .map((id) => realAnchors.find((a) => a.id === id))
        .filter((a): a is LiteraryAnchor => a !== undefined && a.realCoord !== undefined)
    : [];

  return (
    <div className="pw-panel-stack">
      {/* 头部经典文献介绍 */}
      <div
        style={{
          padding: '6px 0 8px 0',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>📜</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>
              {source.title}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{source.subtitle}</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>
          {source.era} · {source.author}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', lineHeight: 1.45 }}>
          {source.description}
        </div>
      </div>

      {/* 4 大核心视图切换 */}
      <div className="pw-segmented" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
        {(Object.entries(VIEW_LABELS) as [LiteraryViewMode, string][]).map(([v, label]) => (
          <button
            key={v}
            type="button"
            className={view === v ? 'is-active' : ''}
            onClick={() => {
              tool.setView(v);
              if (v !== 'routes') tool.setRoutePlaying(false);
            }}
            style={{ fontSize: 11, padding: '4px 2px' }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 锚点模式：置信度筛选 */}
      {view === 'anchors' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(Object.entries(CONFIDENCE_LABELS) as [AnchorConfidence, string][]).map(([c, label]) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleConf(c)}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 10,
                border: `1px solid ${CONFIDENCE_COLORS[c]}`,
                background: confidenceFilter.includes(c)
                  ? `${CONFIDENCE_COLORS[c]}33`
                  : 'transparent',
                color: confidenceFilter.includes(c) ? CONFIDENCE_COLORS[c] : 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
              }}
            >
              {label} ({groups[c]?.length ?? 0})
            </button>
          ))}
        </div>
      )}

      {/* 锚点视图 */}
      {view === 'anchors' && (
        <>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            {source.anchors
              .filter((a) => confidenceFilter.includes(a.confidence))
              .filter((a) => a.realCoord !== undefined)
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    const nextId = a.id === highlightId ? null : a.id;
                    tool.setHighlightAnchor(nextId);
                    if (a.realCoord && mapRef.current) {
                      mapRef.current.flyTo({ center: a.realCoord, zoom: 7.5, duration: 1000 });
                      showAnchorPopup(mapRef.current, a);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 8px',
                    borderRadius: 5,
                    fontSize: 11,
                    border:
                      a.id === highlightId
                        ? `1px solid ${CONFIDENCE_COLORS[a.confidence]}`
                        : '1px solid rgba(255,255,255,0.05)',
                    background:
                      a.id === highlightId
                        ? `${CONFIDENCE_COLORS[a.confidence]}22`
                        : 'rgba(255,255,255,0.02)',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: CONFIDENCE_COLORS[a.confidence],
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13 }}>{ANCHOR_ICONS[a.category] ?? '📍'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span>{a.nameZh ?? a.name}</span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>
                      {CONFIDENCE_LABELS[a.confidence]}
                    </span>
                  </span>
                  {a.id === highlightId && <ChevronRight size={12} color="#4fc3f7" />}
                </button>
              ))}
          </div>

          {/* 选定锚点详情卡片 */}
          {hlAnchor && (
            <div
              style={{
                padding: 10,
                borderRadius: 6,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${CONFIDENCE_COLORS[hlAnchor.confidence]}55`,
                fontSize: 11,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{ANCHOR_ICONS[hlAnchor.category]}</span>
                <span>{hlAnchor.nameZh ?? hlAnchor.name}</span>
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 3,
                  background: `${CONFIDENCE_COLORS[hlAnchor.confidence]}25`,
                  color: CONFIDENCE_COLORS[hlAnchor.confidence],
                }}>
                  {CONFIDENCE_LABELS[hlAnchor.confidence]}
                </span>
              </div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.7)',
                  lineHeight: 1.5,
                  fontStyle: 'italic',
                }}
              >
                「{hlAnchor.description}」
              </div>
              {hlAnchor.realCoord && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                  📍 真实地理对应: {hlAnchor.realCoord[0].toFixed(2)}°E, {hlAnchor.realCoord[1].toFixed(2)}°N
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 叙事路线视图（修复路线播放、章节进度、定位跟踪） */}
      {view === 'routes' && source.routes && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {source.routes.map((route, i) => (
              <button
                key={route.id}
                type="button"
                onClick={() => {
                  tool.setActiveRouteIdx(i);
                  tool.setRoutePlaying(true);
                  const coords = route.anchorIds
                    .map((id) => realAnchors.find((a) => a.id === id))
                    .filter((a): a is LiteraryAnchor => a !== undefined && a.realCoord !== undefined)
                    .map((a) => a.realCoord!);

                  if (coords.length > 0 && mapRef.current) {
                    const bounds = new maplibregl.LngLatBounds();
                    coords.forEach((c) => bounds.extend(c));
                    mapRef.current.fitBounds(bounds, {
                      padding: { top: 80, bottom: 80, left: 320, right: 80 },
                      maxZoom: 7,
                      duration: 1000,
                    });
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  border:
                    activeRouteIdx === i
                      ? '1.5px solid #f59e0b'
                      : '1px solid rgba(255,255,255,0.06)',
                  background: activeRouteIdx === i ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.02)',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Route size={16} color={activeRouteIdx === i ? '#f59e0b' : '#94a3b8'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: activeRouteIdx === i ? '#f59e0b' : '#fff' }}>
                    {route.nameZh}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {route.description}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* 路线播放器控制器 */}
          {currentRoute && (
            <div style={{
              background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>
                  {currentRoute.nameZh} · 叙事漫游
                </span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                  进度: {Math.round(routeProgress * 100)}%
                </span>
              </div>

              {/* 进度条 */}
              <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${routeProgress * 100}%`, height: '100%', background: '#f59e0b', transition: 'width 0.1s linear' }} />
              </div>

              {/* 当前章节站点 */}
              {routeAnchors[currentWaypointIdx] && (
                <div style={{
                  background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '6px 8px', fontSize: 11,
                  display: 'flex', flexDirection: 'column', gap: 3,
                }}>
                  <div style={{ color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{ANCHOR_ICONS[routeAnchors[currentWaypointIdx]!.category]}</span>
                    <span>第 {currentWaypointIdx + 1}/{routeAnchors.length} 站：{routeAnchors[currentWaypointIdx]!.nameZh}</span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontStyle: 'italic', lineHeight: 1.4 }}>
                    「{routeAnchors[currentWaypointIdx]!.description}」
                  </div>
                </div>
              )}

              {/* 控制按钮组 */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={() => tool.setRoutePlaying(!routePlaying)}
                  style={{
                    flex: 1, padding: '5px 10px', borderRadius: 4,
                    background: routePlaying ? '#f59e0b' : 'rgba(245,158,11,0.2)',
                    color: routePlaying ? '#000' : '#f59e0b',
                    border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 11,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}
                >
                  {routePlaying ? <Pause size={14} /> : <Play size={14} />}
                  <span>{routePlaying ? '暂停漫游' : '启程漫游'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFollowCamera(!followCamera)}
                  style={{
                    padding: '5px 8px', borderRadius: 4,
                    background: followCamera ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)',
                    color: followCamera ? '#38bdf8' : 'rgba(255,255,255,0.6)',
                    border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                    fontSize: 10, display: 'flex', alignItems: 'center', gap: 3,
                  }}
                >
                  <Navigation size={12} />
                  <span>{followCamera ? '视角锁定' : '视角自由'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 异兽图鉴视图 */}
      {view === 'gallery' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {source.anchors
            .filter((a) => a.category === 'creature' || a.category === 'character')
            .map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  tool.setHighlightAnchor(a.id);
                  if (a.realCoord && mapRef.current) {
                    mapRef.current.flyTo({ center: a.realCoord, zoom: 6.5, duration: 1000 });
                    showAnchorPopup(mapRef.current, a);
                  }
                }}
                style={{
                  padding: 8,
                  borderRadius: 6,
                  border: a.id === highlightId ? '1.5px solid #a855f7' : '1px solid rgba(255,255,255,0.08)',
                  background: a.id === highlightId ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.02)',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <span style={{ fontSize: 26 }}>{ANCHOR_ICONS[a.category] ?? '🐉'}</span>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{a.nameZh ?? a.name}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', lineHeight: 1.3 }}>
                  {a.description.slice(0, 36)}...
                </div>
              </button>
            ))}
        </div>
      )}

      {/* 幻想空间视图（山海神舆图·天圆地方古宇宙模型） */}
      {view === 'fantasy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            fontSize: 11, color: '#c084fc', display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(192,132,252,0.1)', padding: '6px 10px', borderRadius: 6,
          }}>
            <Sparkles size={14} />
            <span>古华夏山海神舆图 · 天圆地方九野八纮模型</span>
          </div>

          {/* SVG 幻想宇宙罗盘交互画板 */}
          <div style={{
            width: '100%', height: 240, background: '#0e0b16',
            borderRadius: 8, border: '1px solid rgba(192,132,252,0.25)',
            position: 'relative', overflow: 'hidden',
          }}>
            <svg viewBox="-360 -300 720 600" style={{ width: '100%', height: '100%', display: 'block' }}>
              {/* 天圆外环 */}
              <circle cx="0" cy="0" r="280" fill="none" stroke="rgba(192,132,252,0.15)" strokeWidth="1.5" strokeDasharray="6 4" />
              <circle cx="0" cy="0" r="240" fill="none" stroke="rgba(192,132,252,0.1)" strokeWidth="1" />
              <text x="0" y="-285" fill="rgba(192,132,252,0.4)" fontSize="11" textAnchor="middle">北冥玄天</text>
              <text x="0" y="295" fill="rgba(192,132,252,0.4)" fontSize="11" textAnchor="middle">南极炎火</text>
              <text x="-295" y="4" fill="rgba(192,132,252,0.4)" fontSize="11" textAnchor="middle">西极幽冥</text>
              <text x="295" y="4" fill="rgba(192,132,252,0.4)" fontSize="11" textAnchor="middle">东海无涯</text>

              {/* 地方内方 */}
              <rect x="-180" y="-180" width="360" height="360" fill="rgba(30,20,45,0.5)" stroke="rgba(245,158,11,0.2)" strokeWidth="1.5" />
              <text x="0" y="-185" fill="rgba(245,158,11,0.5)" fontSize="10" textAnchor="middle">华夏大荒九畴方舆</text>

              {/* 归墟大壑涡流 */}
              <circle cx="320" cy="-30" r="28" fill="rgba(14,165,233,0.12)" stroke="rgba(14,165,233,0.3)" strokeDasharray="3 3" />

              {/* 渲染神话锚点 */}
              {fantasyAnchors.map((fa) => {
                const [x, y] = fa.fantasyCoord ?? [0, 0];
                const isSel = selectedMythical?.id === fa.id;
                return (
                  <g
                    key={fa.id}
                    transform={`translate(${x}, ${y})`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedMythical(fa)}
                  >
                    <circle
                      r={isSel ? 10 : 6}
                      fill={isSel ? '#c084fc' : '#a855f7'}
                      stroke="#fff"
                      strokeWidth={isSel ? 2.5 : 1.5}
                      filter="drop-shadow(0 0 6px rgba(192,132,252,0.6))"
                    />
                    <text
                      y={-10}
                      fill={isSel ? '#f8fafc' : 'rgba(255,255,255,0.75)'}
                      fontSize={isSel ? 12 : 10}
                      fontWeight={isSel ? 'bold' : 'normal'}
                      textAnchor="middle"
                    >
                      {fa.nameZh ?? fa.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* 纯幻想神话点详情卡片 */}
          {selectedMythical && (
            <div style={{
              background: 'rgba(192,132,252,0.08)', border: '1px solid rgba(192,132,252,0.3)',
              borderRadius: 8, padding: '10px 12px', fontSize: 11,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{ fontWeight: 600, color: '#c084fc', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{ANCHOR_ICONS[selectedMythical.category]}</span>
                <span>{selectedMythical.name}</span>
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(192,132,252,0.2)', color: '#c084fc' }}>
                  纯幻想天道
                </span>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.5, fontStyle: 'italic' }}>
                「{selectedMythical.description}」
              </div>
            </div>
          )}
        </div>
      )}

      {/* 底部重置按钮 */}
      <button
        type="button"
        className="pw-secondary-button"
        onClick={() => {
          tool.reset();
          if (popupRef.current) popupRef.current.remove();
          cleanupAll(mapRef.current!);
        }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}
      >
        <RotateCcw size={14} />
        重置文学地图
      </button>
    </div>
  );
}

// ---- helpers ----

function cleanupAnchors(map: maplibregl.Map) {
  for (const id of [ANCHOR_LABEL_LYR, ANCHOR_LYR, HIGHLIGHT_LYR, BEACON_LYR]) {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* */
    }
  }
  for (const id of [ANCHOR_SRC, HIGHLIGHT_SRC, BEACON_SRC]) {
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch {
      /* */
    }
  }
}

function cleanupAll(map: maplibregl.Map) {
  cleanupAnchors(map);
  const style = map.getStyle();
  if (!style) return;
  for (const layer of style.layers ?? []) {
    if (layer.id.startsWith(ROUTE_LYR_PREFIX)) {
      try {
        map.removeLayer(layer.id);
      } catch {
        /* */
      }
    }
  }
  for (const srcId of Object.keys(style.sources ?? {})) {
    if (srcId.startsWith(ROUTE_SRC_PREFIX)) {
      try {
        map.removeSource(srcId);
      } catch {
        /* */
      }
    }
  }
}
