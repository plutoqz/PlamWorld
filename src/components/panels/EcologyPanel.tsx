// components/panels/EcologyPanel.tsx — 生态 & 生物多样性面板 (v0.6)

import { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { RotateCcw, Play, Pause, ChevronRight } from 'lucide-react';
import type { EcologyTool, EcologyView } from '../../tools/ecology.tool';
import { VIEW_LABELS } from '../../tools/ecology.tool';
import type { SpeciesDef, IUCNStatus, SpeciesCategory } from '../../core/ecology';
import { IUCN_COLORS, IUCN_LABELS, CATEGORY_LABELS } from '../../core/ecology';

// ---- constants ----
const SPECIES_SRC_PREFIX = 'palm-eco-species-';
const SPECIES_FILL_PREFIX = 'palm-eco-fill-';
const SPECIES_LINE_PREFIX = 'palm-eco-line-';
const MIG_SRC_PREFIX = 'palm-eco-mig-';
const MIG_LYR_PREFIX = 'palm-eco-mig-lyr-';
const MIG_PT_SRC = 'palm-eco-mig-pt-src';
const MIG_PT_LYR = 'palm-eco-mig-pt-lyr';

interface EcologyPanelProps {
  tool: EcologyTool;
}

export function EcologyPanel({ tool }: EcologyPanelProps) {
  const [view, setView] = useState<EcologyView>(tool.state.view);
  const [categoryFilter, setCategoryFilter] = useState<SpeciesCategory | 'all'>(
    tool.state.categoryFilter,
  );
  const [iucnFilter, setIucnFilter] = useState<IUCNStatus[]>([...tool.state.iucnFilter]);
  const [highlightId, setHighlightId] = useState<string | null>(tool.state.highlightSpeciesId);
  const [isPlaying, setIsPlaying] = useState(tool.state.isPlaying);
  const [animSpeed, setAnimSpeed] = useState(tool.state.animationSpeed);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const animRef = useRef<number | null>(null);
  const animProgressRef = useRef(0);

  // sync
  useEffect(() => {
    const onStateChange = () => {
      setView(tool.state.view);
      setCategoryFilter(tool.state.categoryFilter);
      setIucnFilter([...tool.state.iucnFilter]);
      setHighlightId(tool.state.highlightSpeciesId);
      setIsPlaying(tool.state.isPlaying);
      setAnimSpeed(tool.state.animationSpeed);
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
    return () => {
      cleanupAll(map);
      stopAnimation();
    };
  }, []);

  // render when filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    cleanupAll(map);

    if (view === 'species') {
      const filtered = tool.getAllSpecies().filter((s) => {
        if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
        if (!iucnFilter.includes(s.iucnStatus)) return false;
        return true;
      });
      filtered.forEach((s) => {
        const opacity = s.id === highlightId ? 0.5 : 0.22;
        renderSpecies(map, s, opacity);
      });
    }

    if (view === 'migration') {
      renderMigrationRoutes(map);
      if (isPlaying) startAnimation();
    }
  }, [view, categoryFilter, iucnFilter, highlightId, isPlaying]);

  // animation
  const startAnimation = useCallback(() => {
    if (animRef.current) return;
    animProgressRef.current = 0;
    const map = mapRef.current;
    if (!map) return;

    const routes = tool.getAllRoutes();
    if (routes.length === 0) return;

    const tick = () => {
      animProgressRef.current += (0.002 * animSpeed) / 100;
      if (animProgressRef.current > 1) animProgressRef.current = 0;

      const ptSrc = map.getSource(MIG_PT_SRC) as maplibregl.GeoJSONSource | undefined;
      if (ptSrc) {
        ptSrc.setData({
          type: 'FeatureCollection',
          features: routes.map((route) => {
            const coords = route.path.coordinates;
            const idx = Math.floor(animProgressRef.current * (coords.length - 1));
            const nextIdx = Math.min(idx + 1, coords.length - 1);
            const frac = animProgressRef.current * (coords.length - 1) - idx;
            return {
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: [
                  coords[idx]![0] + (coords[nextIdx]![0] - coords[idx]![0]) * frac,
                  coords[idx]![1] + (coords[nextIdx]![1] - coords[idx]![1]) * frac,
                ],
              },
              properties: { name: route.nameZh },
            };
          }),
        });
      }

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [animSpeed]);

  function stopAnimation() {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }

  function toggleIUCN(status: IUCNStatus) {
    if (iucnFilter.includes(status)) {
      const next = iucnFilter.filter((s) => s !== status);
      tool.setIucnFilter(next);
    } else {
      tool.setIucnFilter([...iucnFilter, status]);
    }
  }

  return (
    <div className="pw-panel-stack">
      {/* 视图切换 */}
      <div className="pw-segmented">
        {(Object.entries(VIEW_LABELS) as [EcologyView, string][]).map(([v, label]) => (
          <button
            key={v}
            type="button"
            className={view === v ? 'is-active' : ''}
            onClick={() => {
              tool.setView(v);
              stopAnimation();
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 物种视图 */}
      {view === 'species' && (
        <>
          {/* 分类筛选 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, color: 'var(--pw-text-muted)' }}>分类</label>
            <select
              value={categoryFilter}
              onChange={(e) => tool.setCategoryFilter(e.target.value as SpeciesCategory | 'all')}
              style={{
                padding: '4px 8px',
                border: '1px solid var(--pw-border)',
                borderRadius: 4,
                background: '#11161a',
                color: 'var(--pw-text)',
                fontSize: 12,
              }}
            >
              <option value="all">全部</option>
              {(Object.entries(CATEGORY_LABELS) as [SpeciesCategory, string][]).map(
                ([c, label]) => (
                  <option key={c} value={c}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>

          {/* IUCN 筛选 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, color: 'var(--pw-text-muted)' }}>保护状态</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(['CR', 'EN', 'VU', 'NT', 'LC'] as IUCNStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleIUCN(status)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 3,
                    fontSize: 10,
                    border: `1px solid ${IUCN_COLORS[status]}`,
                    background: iucnFilter.includes(status)
                      ? `${IUCN_COLORS[status]}33`
                      : 'transparent',
                    color: iucnFilter.includes(status)
                      ? IUCN_COLORS[status]
                      : 'var(--pw-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* 物种列表 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              maxHeight: 200,
              overflowY: 'auto',
            }}
          >
            {tool
              .getAllSpecies()
              .filter((s) => {
                if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
                if (!iucnFilter.includes(s.iucnStatus)) return false;
                return true;
              })
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    tool.setHighlightSpecies(s.id === highlightId ? null : s.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    border:
                      s.id === highlightId
                        ? `1px solid ${IUCN_COLORS[s.iucnStatus]}`
                        : '1px solid transparent',
                    background:
                      s.id === highlightId ? `${IUCN_COLORS[s.iucnStatus]}15` : 'transparent',
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
                      background: IUCN_COLORS[s.iucnStatus],
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1 }}>{s.nameZh}</span>
                  <span style={{ fontSize: 9, color: 'var(--pw-text-faint)' }}>
                    {CATEGORY_LABELS[s.category]}
                  </span>
                  {s.id === highlightId && <ChevronRight size={12} />}
                </button>
              ))}
          </div>

          {/* 物种详情 */}
          {highlightId &&
            (() => {
              const s = tool.getAllSpecies().find((sp) => sp.id === highlightId);
              if (!s) return null;
              return (
                <div
                  style={{
                    padding: 8,
                    borderRadius: 4,
                    background: '#0d1217',
                    border: `1px solid ${IUCN_COLORS[s.iucnStatus]}44`,
                    fontSize: 11,
                  }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--pw-text)' }}>{s.nameZh}</div>
                  <div style={{ fontSize: 10, color: 'var(--pw-text-faint)' }}>{s.name}</div>
                  <div style={{ marginTop: 4, color: 'var(--pw-text-muted)' }}>{s.description}</div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                    <span style={{ color: IUCN_COLORS[s.iucnStatus], fontWeight: 600 }}>
                      {IUCN_LABELS[s.iucnStatus]}
                    </span>
                    <span style={{ color: 'var(--pw-text-faint)', fontSize: 10 }}>
                      趋势:{' '}
                      {s.trend === 'increasing'
                        ? '📈 增长'
                        : s.trend === 'stable'
                          ? '➡️ 稳定'
                          : s.trend === 'decreasing'
                            ? '📉 下降'
                            : '❓ 未知'}
                    </span>
                  </div>
                </div>
              );
            })()}
        </>
      )}

      {/* 迁徙视图 */}
      {view === 'migration' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tool.getAllRoutes().map((r) => (
              <div
                key={r.id}
                style={{
                  padding: '6px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  background: '#0d1217',
                  border: '1px solid var(--pw-border)',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--pw-text)' }}>{r.nameZh}</div>
                <div style={{ fontSize: 10, color: 'var(--pw-text-muted)' }}>{r.description}</div>
                <div style={{ fontSize: 9, color: 'var(--pw-text-faint)', marginTop: 2 }}>
                  {r.season}
                </div>
              </div>
            ))}
          </div>

          {/* 播放控制 */}
          <div className="pw-control-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="pw-primary-button"
              onClick={() => {
                const next = !isPlaying;
                tool.setPlaying(next);
                if (next) startAnimation();
                else stopAnimation();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                flex: 1,
                justifyContent: 'center',
              }}
            >
              {isPlaying ? (
                <>
                  <Pause size={14} /> 暂停
                </>
              ) : (
                <>
                  <Play size={14} /> 播放迁徙
                </>
              )}
            </button>
          </div>
          <div className="pw-control-row">
            <label>速度</label>
            <input
              type="range"
              min={10}
              max={500}
              value={animSpeed}
              onChange={(e) => tool.setAnimationSpeed(Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <output>{animSpeed}x</output>
          </div>
        </>
      )}

      {/* 热力视图 */}
      {view === 'hotspot' && (
        <div
          style={{
            padding: '8px 0',
            fontSize: 11,
            color: 'var(--pw-text-muted)',
            textAlign: 'center',
          }}
        >
          <p>根据当前筛选条件 ({iucnFilter.join('/')})，对物种分布进行聚合。</p>
          <p style={{ fontSize: 10, marginTop: 4 }}>
            在线模式可接入 IUCN Red List API 获取完整数据。
          </p>
        </div>
      )}

      {/* 操作 */}
      <button
        type="button"
        className="pw-secondary-button"
        onClick={() => {
          tool.reset();
          stopAnimation();
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

// ---- render helpers ----

function renderSpecies(map: maplibregl.Map, species: SpeciesDef, opacity: number) {
  const srcId = `${SPECIES_SRC_PREFIX}${species.id}`;
  const fillId = `${SPECIES_FILL_PREFIX}${species.id}`;
  const lineId = `${SPECIES_LINE_PREFIX}${species.id}`;
  const color = IUCN_COLORS[species.iucnStatus];

  const geojson: GeoJSON.Feature = {
    type: 'Feature',
    geometry: species.distribution,
    properties: { id: species.id, name: species.nameZh },
  };

  map.addSource(srcId, { type: 'geojson', data: geojson });
  map.addLayer({
    id: fillId,
    source: srcId,
    type: 'fill',
    paint: { 'fill-color': color, 'fill-opacity': opacity },
  });
  map.addLayer({
    id: lineId,
    source: srcId,
    type: 'line',
    paint: { 'line-color': color, 'line-width': 1.5, 'line-opacity': Math.min(1, opacity + 0.3) },
  });
}

function renderMigrationRoutes(map: maplibregl.Map) {
  // Dummy route data for rendering
  const routeLines: Array<{ id: string; nameZh: string; coords: [number, number][] }> = [
    {
      id: 'eaaf',
      nameZh: '东亚-澳大利亚',
      coords: [
        [130, 50],
        [125, 40],
        [120, 30],
        [110, 20],
        [106, 0],
        [130, -12],
        [145, -25],
        [145, -38],
      ],
    },
    {
      id: 'arctic-tern',
      nameZh: '北极燕鸥',
      coords: [
        [-55, 72],
        [-40, 55],
        [-25, 25],
        [-18, 0],
        [-25, -20],
        [-35, -50],
        [-50, -68],
      ],
    },
    {
      id: 'monarch-butterfly',
      nameZh: '帝王蝶',
      coords: [
        [-95, 50],
        [-90, 40],
        [-88, 35],
        [-95, 25],
        [-100, 20],
        [-102, 19],
      ],
    },
    {
      id: 'wildebeest',
      nameZh: '角马',
      coords: [
        [34.5, -1.5],
        [35.2, -2.5],
        [35.8, -2.5],
        [35.2, -2.0],
        [34.5, -1.5],
      ],
    },
    {
      id: 'humpback-whale',
      nameZh: '座头鲸',
      coords: [
        [-155, 58],
        [-150, 42],
        [-148, 35],
        [-155, 22],
        [-157, 20],
      ],
    },
  ];

  for (const route of routeLines) {
    const srcId = `${MIG_SRC_PREFIX}${route.id}`;
    const lyrId = `${MIG_LYR_PREFIX}${route.id}`;

    const geojson: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: route.coords },
      properties: { id: route.id, name: route.nameZh },
    };

    map.addSource(srcId, { type: 'geojson', data: geojson });
    map.addLayer({
      id: lyrId,
      source: srcId,
      type: 'line',
      paint: {
        'line-color': [
          'match',
          ['get', 'id'],
          'eaaf',
          '#3498db',
          'arctic-tern',
          '#e74c3c',
          'monarch-butterfly',
          '#f39c12',
          'wildebeest',
          '#2ecc71',
          '#9b59b6',
        ],
        'line-width': 2.5,
        'line-opacity': 0.8,
        'line-dasharray': [4, 2],
      },
    });
  }

  // animated points
  const ptGeojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: routeLines.map((r) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: r.coords[0]! },
      properties: { id: r.id, name: r.nameZh },
    })),
  };

  map.addSource(MIG_PT_SRC, { type: 'geojson', data: ptGeojson });
  map.addLayer({
    id: MIG_PT_LYR,
    source: MIG_PT_SRC,
    type: 'circle',
    paint: {
      'circle-radius': 6,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#000',
      'circle-stroke-width': 2,
      'circle-opacity': 0.9,
    },
  });
}

function cleanupAll(map: maplibregl.Map) {
  const prefixes = [
    SPECIES_SRC_PREFIX,
    SPECIES_FILL_PREFIX,
    SPECIES_LINE_PREFIX,
    MIG_SRC_PREFIX,
    MIG_LYR_PREFIX,
  ];
  const pointIds = [MIG_PT_SRC, MIG_PT_LYR];

  const style = map.getStyle();
  if (style) {
    for (const layer of style.layers ?? []) {
      if (prefixes.some((p) => layer.id.startsWith(p)) || pointIds.includes(layer.id)) {
        try {
          map.removeLayer(layer.id);
        } catch {
          /* */
        }
      }
    }
    for (const srcId of Object.keys(style.sources ?? {})) {
      if (prefixes.some((p) => srcId.startsWith(p)) || pointIds.includes(srcId)) {
        try {
          map.removeSource(srcId);
        } catch {
          /* */
        }
      }
    }
  }
}
