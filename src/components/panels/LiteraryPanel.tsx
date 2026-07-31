// components/panels/LiteraryPanel.tsx — 文学地图面板 (v0.6)
//
// 山海经首发实现：锚点地图 / 叙事路线 / 异兽图鉴 / 幻想空间

import { useState, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { RotateCcw, ChevronRight, Route, Sparkles } from 'lucide-react';
import type { LiteraryMapTool, LiteraryViewMode } from '../../tools/literary-map.tool';
import { VIEW_LABELS } from '../../tools/literary-map.tool';
import type { AnchorConfidence, AnchorCategory } from '../../core/literary-map';
import {
  CONFIDENCE_LABELS,
  CONFIDENCE_COLORS,
  groupByConfidence,
  getRealAnchors,
} from '../../core/literary-map';

// ---- constants ----
const ANCHOR_SRC = 'palm-lit-anchor-src';
const ANCHOR_LYR = 'palm-lit-anchor-lyr';
const ROUTE_SRC_PREFIX = 'palm-lit-route-';
const ROUTE_LYR_PREFIX = 'palm-lit-route-lyr-';
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

  const mapRef = useRef<maplibregl.Map | null>(null);

  const source = tool.getSource();
  const realAnchors = getRealAnchors(source.anchors);

  // sync
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

  // mount
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map;
    mapRef.current = map;

    // click on anchor
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [ANCHOR_LYR] });
      if (features.length > 0) {
        const id = features[0]!.properties?.id as string | undefined;
        if (id) tool.setHighlightAnchor(id);
      }
    };
    map.on('click', onClick);

    return () => {
      map.off('click', onClick);
      cleanupAll(map);
    };
  }, []);

  // render anchors on map
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
      map.addLayer({
        id: ANCHOR_LYR,
        source: ANCHOR_SRC,
        type: 'circle',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5, 10, 10],
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
          'circle-opacity': 0.85,
        },
      });

      // highlight
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
              'circle-radius': 12,
              'circle-color': CONFIDENCE_COLORS[hlAnchor.confidence],
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 3,
              'circle-opacity': 1,
            },
          });
        }
      }
    }

    // render routes
    if (view === 'routes') {
      source.routes?.forEach((route, ri) => {
        if (ri !== activeRouteIdx && !routePlaying) return;
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
            'line-color': '#e74c3c',
            'line-width': 2.5,
            'line-opacity': 0.7,
            'line-dasharray': [4, 2],
          },
        });
      });
    }
  }, [view, confidenceFilter, highlightId, activeRouteIdx, routePlaying]);

  // toggle confidence
  function toggleConf(c: AnchorConfidence) {
    if (confidenceFilter.includes(c)) {
      tool.setConfidenceFilter(confidenceFilter.filter((f) => f !== c));
    } else {
      tool.setConfidenceFilter([...confidenceFilter, c]);
    }
  }

  // anchor groups
  const groups = groupByConfidence(source.anchors);

  // highlight anchor detail
  const hlAnchor = source.anchors.find((a) => a.id === highlightId);

  return (
    <div className="pw-panel-stack">
      {/* Header */}
      <div
        style={{
          padding: '8px 0',
          borderBottom: '1px solid var(--pw-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>📜</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--pw-text)' }}>
              {source.title}
            </div>
            <div style={{ fontSize: 10, color: 'var(--pw-text-faint)' }}>{source.subtitle}</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--pw-text-muted)' }}>
          {source.era} · {source.author}
        </div>
        <div style={{ fontSize: 10, color: 'var(--pw-text-faint)', lineHeight: 1.5 }}>
          {source.description}
        </div>
      </div>

      {/* 视图切换 */}
      <div className="pw-segmented" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {(Object.entries(VIEW_LABELS) as [LiteraryViewMode, string][]).map(([v, label]) => (
          <button
            key={v}
            type="button"
            className={view === v ? 'is-active' : ''}
            onClick={() => tool.setView(v)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 置信度筛选 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {(Object.entries(CONFIDENCE_LABELS) as [AnchorConfidence, string][]).map(([c, label]) => (
          <button
            key={c}
            type="button"
            onClick={() => toggleConf(c)}
            style={{
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              border: `1px solid ${CONFIDENCE_COLORS[c]}`,
              background: confidenceFilter.includes(c)
                ? `${CONFIDENCE_COLORS[c]}33`
                : 'transparent',
              color: confidenceFilter.includes(c) ? CONFIDENCE_COLORS[c] : 'var(--pw-text-muted)',
              cursor: 'pointer',
            }}
          >
            {label} ({groups[c]?.length ?? 0})
          </button>
        ))}
      </div>

      {/* 锚点视图 */}
      {(view === 'anchors' || view === 'routes') && (
        <>
          {/* 锚点列表 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              maxHeight: 200,
              overflowY: 'auto',
            }}
          >
            {source.anchors
              .filter((a) => confidenceFilter.includes(a.confidence))
              .filter((a) => a.realCoord !== undefined) // only real anchors
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    tool.setHighlightAnchor(a.id === highlightId ? null : a.id);
                    if (a.realCoord && mapRef.current) {
                      mapRef.current.flyTo({ center: a.realCoord, zoom: 7, duration: 1200 });
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    border:
                      a.id === highlightId
                        ? `1px solid ${CONFIDENCE_COLORS[a.confidence]}`
                        : '1px solid transparent',
                    background:
                      a.id === highlightId ? `${CONFIDENCE_COLORS[a.confidence]}15` : 'transparent',
                    color: 'var(--pw-text)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: CONFIDENCE_COLORS[a.confidence],
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 14 }}>{ANCHOR_ICONS[a.category] ?? '📍'}</span>
                  <span style={{ flex: 1 }}>
                    <span>{a.nameZh ?? a.name}</span>
                    <span style={{ fontSize: 9, color: 'var(--pw-text-faint)', marginLeft: 4 }}>
                      {CONFIDENCE_LABELS[a.confidence]}
                    </span>
                  </span>
                  {a.id === highlightId && <ChevronRight size={12} />}
                </button>
              ))}
          </div>

          {/* 锚点详情 */}
          {hlAnchor && (
            <div
              style={{
                padding: 8,
                borderRadius: 4,
                background: '#0d1217',
                border: `1px solid ${CONFIDENCE_COLORS[hlAnchor.confidence]}44`,
                fontSize: 11,
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--pw-text)' }}>
                {ANCHOR_ICONS[hlAnchor.category]} {hlAnchor.nameZh ?? hlAnchor.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--pw-text-faint)' }}>{hlAnchor.name}</div>
              <div
                style={{
                  marginTop: 4,
                  color: 'var(--pw-text-muted)',
                  lineHeight: 1.5,
                  fontStyle: 'italic',
                }}
              >
                「{hlAnchor.description}」
              </div>
              {hlAnchor.realCoord && (
                <div style={{ marginTop: 4, fontSize: 10, color: 'var(--pw-text-faint)' }}>
                  地理锚定: {hlAnchor.realCoord[0].toFixed(2)}°E, {hlAnchor.realCoord[1].toFixed(2)}
                  °N ({CONFIDENCE_LABELS[hlAnchor.confidence]})
                </div>
              )}
              {hlAnchor.relatedAnchors && hlAnchor.relatedAnchors.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 10, color: 'var(--pw-text-faint)' }}>
                  关联:{' '}
                  {hlAnchor.relatedAnchors
                    .map((id) => {
                      const a = source.anchors.find((x) => x.id === id);
                      return a?.nameZh ?? a?.name ?? id;
                    })
                    .join(' · ')}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 路线视图 */}
      {view === 'routes' && source.routes && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, color: 'var(--pw-text-muted)' }}>
            叙事路线 ({source.routes.length})
          </label>
          {source.routes.map((route, i) => (
            <button
              key={route.id}
              type="button"
              onClick={() => {
                tool.setActiveRouteIdx(i);
                tool.setRoutePlaying(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 4,
                fontSize: 11,
                border:
                  activeRouteIdx === i && routePlaying
                    ? '1px solid #e74c3c'
                    : '1px solid var(--pw-border)',
                background: activeRouteIdx === i && routePlaying ? '#e74c3c11' : '#0d1217',
                color: 'var(--pw-text)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Route size={14} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{route.nameZh}</div>
                <div style={{ fontSize: 10, color: 'var(--pw-text-muted)' }}>
                  {route.description.slice(0, 50)}...
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 异兽图鉴 */}
      {view === 'gallery' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            maxHeight: 300,
            overflowY: 'auto',
          }}
        >
          {source.anchors
            .filter((a) => a.category === 'creature' || a.category === 'character')
            .map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => tool.setHighlightAnchor(a.id)}
                style={{
                  padding: 8,
                  borderRadius: 6,
                  border: a.id === highlightId ? '2px solid #9b59b6' : '1px solid var(--pw-border)',
                  background: a.id === highlightId ? '#9b59b615' : '#0d1217',
                  color: 'var(--pw-text)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 28 }}>🐉</span>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{a.nameZh ?? a.name}</div>
                <div style={{ fontSize: 9, color: 'var(--pw-text-faint)', lineHeight: 1.3 }}>
                  {a.description.slice(0, 40)}...
                </div>
              </button>
            ))}
        </div>
      )}

      {/* 幻想空间 */}
      {view === 'fantasy' && (
        <div
          style={{
            padding: 16,
            textAlign: 'center',
            color: 'var(--pw-text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Sparkles size={32} style={{ color: '#9b59b6' }} />
          <div style={{ fontSize: 13 }}>
            纯幻想锚点 (
            {getRealAnchors(source.anchors.filter((a) => a.confidence === 'mythical')).length === 0
              ? source.anchors.filter((a) => a.confidence === 'mythical').length
              : 0}
            个)
          </div>
          <div style={{ fontSize: 10 }}>这些地点存在于幻想空间，无法在地图上定位。</div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              justifyContent: 'center',
              marginTop: 8,
            }}
          >
            {source.anchors
              .filter((a) => a.confidence === 'mythical')
              .map((a) => (
                <span
                  key={a.id}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 3,
                    fontSize: 10,
                    background: '#9b59b622',
                    border: '1px solid #9b59b644',
                    color: '#9b59b6',
                  }}
                >
                  {a.nameZh ?? a.name}
                </span>
              ))}
          </div>
          <div style={{ fontSize: 9, color: 'var(--pw-text-faint)', marginTop: 12 }}>
            后续版本将添加自定义 Canvas 幻想地图空间，支持完全虚构的地理坐标系。
          </div>
        </div>
      )}

      {/* 统计 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 4,
          fontSize: 10,
          color: 'var(--pw-text-faint)',
          padding: '4px 0',
          borderTop: '1px solid var(--pw-border)',
        }}
      >
        <span>锚点: {source.anchors.length}</span>
        <span>真实: {realAnchors.length}</span>
        <span>路线: {source.routes?.length ?? 0}</span>
        <span>异兽: {source.anchors.filter((a) => a.category === 'creature').length}</span>
      </div>

      {/* 重置 */}
      <button
        type="button"
        className="pw-secondary-button"
        onClick={() => {
          tool.reset();
          cleanupAll(mapRef.current!);
        }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <RotateCcw size={14} />
        重置
      </button>
    </div>
  );
}

// ---- helpers ----

function cleanupAnchors(map: maplibregl.Map) {
  for (const id of [ANCHOR_LYR, HIGHLIGHT_LYR])
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* */
    }
  for (const id of [ANCHOR_SRC, HIGHLIGHT_SRC])
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch {
      /* */
    }
}

function cleanupAll(map: maplibregl.Map) {
  cleanupAnchors(map);
  const style = map.getStyle();
  if (!style) return;
  for (const layer of style.layers ?? []) {
    if (layer.id.startsWith(ROUTE_LYR_PREFIX))
      try {
        map.removeLayer(layer.id);
      } catch {
        /* */
      }
  }
  for (const srcId of Object.keys(style.sources ?? {})) {
    if (srcId.startsWith(ROUTE_SRC_PREFIX))
      try {
        map.removeSource(srcId);
      } catch {
        /* */
      }
  }
}
