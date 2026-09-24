import { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  RotateCcw,
  Play,
  Pause,
  ChevronRight,
  Search,
  LoaderCircle,
  Image as ImageIcon,
  MapPin,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Compass,
} from 'lucide-react';
import type { EcologyTool, EcologyView } from '../../tools/ecology.tool';
import { VIEW_LABELS } from '../../tools/ecology.tool';
import type {
  SpeciesDef,
  IUCNStatus,
  SpeciesCategory,
  GBIFOccurrence,
  BiodiversityHotspot,
  MigrationRoute,
} from '../../core/ecology';
import { IUCN_COLORS, IUCN_LABELS, CATEGORY_LABELS } from '../../core/ecology';

// ---- constants ----
const SPECIES_SRC_PREFIX = 'palm-eco-species-';
const SPECIES_FILL_PREFIX = 'palm-eco-fill-';
const SPECIES_LINE_PREFIX = 'palm-eco-line-';
const MIG_SRC_PREFIX = 'palm-eco-mig-';
const MIG_LYR_PREFIX = 'palm-eco-mig-lyr-';
const MIG_PT_SRC = 'palm-eco-mig-pt-src';
const MIG_PT_LYR = 'palm-eco-mig-pt-lyr';
const HOTSPOT_SRC_PREFIX = 'palm-eco-hotspot-src-';
const HOTSPOT_FILL_PREFIX = 'palm-eco-hotspot-fill-';
const HOTSPOT_LINE_PREFIX = 'palm-eco-hotspot-line-';
const HOTSPOT_SYM_PREFIX = 'palm-eco-hotspot-sym-';

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
  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(tool.state.activeHotspotId);
  const [isPlaying, setIsPlaying] = useState(tool.state.isPlaying);
  const [animSpeed, setAnimSpeed] = useState(tool.state.animationSpeed);

  // GBIF 观测状态
  const [occurrences, setOccurrences] = useState<GBIFOccurrence[]>(tool.state.occurrences);
  const [isSearching, setIsSearching] = useState(tool.state.isSearchingOccurrences);
  const [occurrenceError, setOccurrenceError] = useState<string | null>(tool.state.occurrenceError);
  const [selectedOcc, setSelectedOcc] = useState<GBIFOccurrence | null>(
    tool.state.selectedOccurrence,
  );

  const mapRef = useRef<maplibregl.Map | null>(null);
  const animRef = useRef<number | null>(null);
  const animProgressRef = useRef(0);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // sync
  useEffect(() => {
    const onStateChange = () => {
      setView(tool.state.view);
      setCategoryFilter(tool.state.categoryFilter);
      setIucnFilter([...tool.state.iucnFilter]);
      setHighlightId(tool.state.highlightSpeciesId);
      setActiveHotspotId(tool.state.activeHotspotId);
      setIsPlaying(tool.state.isPlaying);
      setAnimSpeed(tool.state.animationSpeed);
      setOccurrences([...tool.state.occurrences]);
      setIsSearching(tool.state.isSearchingOccurrences);
      setOccurrenceError(tool.state.occurrenceError);
      setSelectedOcc(tool.state.selectedOccurrence);
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
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
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
      renderMigrationRoutes(map, tool.getAllRoutes());
      if (isPlaying) startAnimation();
    }

    if (view === 'hotspot') {
      renderHotspots(map, tool.getAllHotspots(), activeHotspotId);
    }
  }, [view, categoryFilter, iucnFilter, highlightId, activeHotspotId, isPlaying]);

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

  // GBIF 观测图钉标记渲染
  useEffect(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const map = mapRef.current;
    if (!map || view !== 'explore') return;

    occurrences.forEach((occ) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.title = `${occ.vernacularName || occ.scientificName} (${occ.iucnStatus})`;
      const isSel = selectedOcc?.key === occ.key;
      el.style.cssText = [
        'width: 26px',
        'height: 26px',
        'border-radius: 50%',
        `border: 2px solid ${IUCN_COLORS[occ.iucnStatus] || '#2ecc71'}`,
        `box-shadow: 0 2px 8px rgba(0,0,0,0.6)${isSel ? `, 0 0 0 3px ${IUCN_COLORS[occ.iucnStatus] || '#2ecc71'}` : ''}`,
        'overflow: hidden',
        'background: #11161a',
        'cursor: pointer',
        'display: flex',
        'align-items: center',
        'justify-content: center',
        'padding: 0',
      ].join(';');

      if (occ.mediaUrl) {
        const img = document.createElement('img');
        img.src = occ.mediaUrl;
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
        el.appendChild(img);
      } else {
        const span = document.createElement('span');
        span.style.fontSize = '12px';
        const icons: Record<string, string> = {
          bird: '🦅',
          mammal: '🦊',
          plant: '🌿',
          reptile: '🦎',
          amphibian: '🐸',
          fish: '🐟',
        };
        span.textContent = icons[occ.category] || '🐾';
        el.appendChild(span);
      }

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        tool.setSelectedOccurrence(occ);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([occ.lng, occ.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [view, occurrences, selectedOcc, tool]);

  const handleSearchBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    tool.searchOccurrences([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
  }, [tool]);

  function toggleIUCN(status: IUCNStatus) {
    if (iucnFilter.includes(status)) {
      const next = iucnFilter.filter((s) => s !== status);
      tool.setIucnFilter(next);
    } else {
      tool.setIucnFilter([...iucnFilter, status]);
    }
  }

  const handleSelectHotspot = useCallback(
    (hs: BiodiversityHotspot) => {
      const isCurrent = hs.id === activeHotspotId;
      const nextId = isCurrent ? null : hs.id;
      tool.setActiveHotspot(nextId);
      if (!isCurrent && mapRef.current) {
        const centroid = getPolygonCentroid(hs.polygon);
        mapRef.current.flyTo({
          center: centroid,
          zoom: 4.5,
          duration: 1000,
        });
      }
    },
    [activeHotspotId, tool],
  );

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

      {/* GBIF 实地探索视图 */}
      {view === 'explore' && (
        <>
          {/* 触发搜索按钮 */}
          <button
            type="button"
            className="pw-primary-button"
            disabled={isSearching}
            onClick={handleSearchBounds}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              fontSize: 12,
              width: '100%',
            }}
          >
            {isSearching ? (
              <>
                <LoaderCircle size={14} className="pw-spin" />
                <span>正在查询 GBIF 全球物种库...</span>
              </>
            ) : (
              <>
                <Search size={14} />
                <span>搜索当前视口物种 (GBIF 数据库)</span>
              </>
            )}
          </button>

          {/* 分类筛选 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, color: 'var(--pw-text-muted)' }}>分类筛选</label>
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
              <option value="all">全部生物</option>
              {(Object.entries(CATEGORY_LABELS) as [SpeciesCategory, string][]).map(
                ([c, label]) => (
                  <option key={c} value={c}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>

          {/* IUCN 保护等级筛选 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, color: 'var(--pw-text-muted)' }}>保护状态筛选</label>
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

          {/* 错误提示 */}
          {occurrenceError && (
            <div style={{ fontSize: 11, color: '#f87171', padding: '4px 0' }}>
              {occurrenceError}
            </div>
          )}

          {/* 观测记录统计 */}
          {occurrences.length > 0 && (
            <div
              style={{
                fontSize: 10,
                color: 'var(--pw-text-muted)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>实地记录 ({occurrences.length})</span>
              <span>点击卡片或地图圆点查看</span>
            </div>
          )}

          {/* 观测记录列表 */}
          {occurrences.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {occurrences.map((occ) => {
                const isSel = selectedOcc?.key === occ.key;
                return (
                  <button
                    key={occ.key}
                    type="button"
                    onClick={() => {
                      tool.setSelectedOccurrence(isSel ? null : occ);
                      if (!isSel && mapRef.current) {
                        mapRef.current.flyTo({
                          center: [occ.lng, occ.lat],
                          zoom: Math.max(9, mapRef.current.getZoom()),
                          duration: 800,
                        });
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 6,
                      borderRadius: 6,
                      fontSize: 11,
                      border: isSel
                        ? `1px solid ${IUCN_COLORS[occ.iucnStatus] || '#3b82f6'}`
                        : '1px solid var(--pw-border)',
                      background: isSel ? 'rgba(59, 130, 246, 0.12)' : '#0d1217',
                      color: 'var(--pw-text)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {occ.mediaUrl ? (
                      <img
                        src={occ.mediaUrl}
                        alt=""
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 4,
                          objectFit: 'cover',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 4,
                          background: 'rgba(255,255,255,0.05)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <ImageIcon size={14} style={{ color: 'var(--pw-text-faint)' }} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <div
                        style={{
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {occ.vernacularName || occ.species || occ.scientificName}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: 'var(--pw-text-muted)',
                          fontStyle: 'italic',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {occ.scientificName}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '1px 5px',
                        borderRadius: 3,
                        fontSize: 9,
                        fontWeight: 600,
                        color: IUCN_COLORS[occ.iucnStatus],
                        border: `1px solid ${IUCN_COLORS[occ.iucnStatus]}44`,
                      }}
                    >
                      {occ.iucnStatus}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 选中记录卡片 */}
          {selectedOcc && (
            <div
              style={{
                padding: 10,
                borderRadius: 6,
                background: '#0d1217',
                border: `1px solid ${IUCN_COLORS[selectedOcc.iucnStatus] || 'var(--pw-border)'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 11,
              }}
            >
              {selectedOcc.mediaUrl && (
                <img
                  src={selectedOcc.mediaUrl}
                  alt={selectedOcc.scientificName}
                  style={{
                    width: '100%',
                    maxHeight: 140,
                    objectFit: 'cover',
                    borderRadius: 4,
                  }}
                />
              )}
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--pw-text)' }}>
                {selectedOcc.vernacularName || selectedOcc.species || selectedOcc.scientificName}
              </div>
              <div style={{ fontStyle: 'italic', color: 'var(--pw-text-muted)', fontSize: 11 }}>
                {selectedOcc.scientificName}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10 }}>
                <span style={{ color: IUCN_COLORS[selectedOcc.iucnStatus], fontWeight: 600 }}>
                  IUCN: {IUCN_LABELS[selectedOcc.iucnStatus] || selectedOcc.iucnStatus}
                </span>
                {selectedOcc.family && (
                  <span style={{ color: 'var(--pw-text-faint)' }}>科: {selectedOcc.family}</span>
                )}
                {selectedOcc.order && (
                  <span style={{ color: 'var(--pw-text-faint)' }}>目: {selectedOcc.order}</span>
                )}
              </div>
              {selectedOcc.eventDate && (
                <div style={{ fontSize: 10, color: 'var(--pw-text-muted)' }}>
                  观测时间: {selectedOcc.eventDate.split('T')[0]}
                </div>
              )}
              {selectedOcc.recordedBy && (
                <div style={{ fontSize: 10, color: 'var(--pw-text-faint)' }}>
                  记录人: {selectedOcc.recordedBy}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 4,
                }}
              >
                <span style={{ fontSize: 9, color: 'var(--pw-text-faint)', display: 'flex', alignItems: 'center', gap: 2 }}>
                  <MapPin size={10} />
                  {selectedOcc.lat.toFixed(4)}°, {selectedOcc.lng.toFixed(4)}°
                </span>
                <a
                  href={`https://www.gbif.org/occurrence/${selectedOcc.key}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 10,
                    color: '#60a5fa',
                    textDecoration: 'none',
                  }}
                >
                  <span>GBIF 详情</span>
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>
          )}
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

      {/* 保护热点视图 (Biodiversity Hotspots) */}
      {view === 'hotspot' && (
        <>
          <div
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              fontSize: 11,
              color: 'var(--pw-text)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600,
                color: '#f87171',
              }}
            >
              <ShieldAlert size={14} />
              <span>全球核心生物多样性保护热点</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--pw-text-muted)', lineHeight: 1.4 }}>
              由保护国际 (CI) 及 IUCN 界定，仅占地表面积 2.5% 却庇护了地球超 50%
              特有维管束植物及高比例濒危脊椎动物。
            </div>
          </div>

          {/* 热点列表 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxHeight: 240,
              overflowY: 'auto',
            }}
          >
            {tool.getAllHotspots().map((hs) => {
              const isSel = hs.id === activeHotspotId;
              const isCrit = hs.threatLevel === 'Critical';
              return (
                <button
                  key={hs.id}
                  type="button"
                  onClick={() => handleSelectHotspot(hs)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: '8px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    border: isSel
                      ? `1px solid ${isCrit ? '#ef4444' : '#f59e0b'}`
                      : '1px solid var(--pw-border)',
                    background: isSel
                      ? isCrit
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'rgba(245, 158, 11, 0.15)'
                      : '#0d1217',
                    color: 'var(--pw-text)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: isCrit ? '#ef4444' : '#f59e0b',
                        }}
                      />
                      <span>{hs.nameZh}</span>
                    </div>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 3,
                        fontSize: 9,
                        fontWeight: 600,
                        color: isCrit ? '#f87171' : '#fbbf24',
                        background: isCrit
                          ? 'rgba(239, 68, 68, 0.18)'
                          : 'rgba(245, 158, 11, 0.18)',
                        border: `1px solid ${isCrit ? '#ef444455' : '#f59e0b55'}`,
                      }}
                    >
                      {isCrit ? '极度受威胁' : '高度受威胁'}
                    </span>
                  </div>

                  <div style={{ fontSize: 9, color: 'var(--pw-text-faint)', fontStyle: 'italic' }}>
                    {hs.name}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      fontSize: 10,
                      color: 'var(--pw-text-muted)',
                      marginTop: 2,
                    }}
                  >
                    <span>面积: {(hs.areaKm2 / 10000).toFixed(1)} 万 km²</span>
                    <span>物种: {hs.speciesRichness.toLocaleString()}</span>
                    <span style={{ color: '#6ee7b7' }}>
                      特有: {hs.endemicSpecies.toLocaleString()} (
                      {Math.round((hs.endemicSpecies / hs.speciesRichness) * 100)}%)
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 选中热点档案卡片 */}
          {activeHotspotId &&
            (() => {
              const hs = tool.getAllHotspots().find((h) => h.id === activeHotspotId);
              if (!hs) return null;
              const isCrit = hs.threatLevel === 'Critical';
              return (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 6,
                    background: '#0d1217',
                    border: `1px solid ${isCrit ? '#ef444466' : '#f59e0b66'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    fontSize: 11,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--pw-text)', fontSize: 12 }}>
                      {hs.nameZh} 档案
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectHotspot(hs)}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid var(--pw-border)',
                        color: 'var(--pw-text)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <Compass size={11} />
                      <span>视口居中</span>
                    </button>
                  </div>

                  <div style={{ color: 'var(--pw-text-muted)', fontSize: 10, lineHeight: 1.5 }}>
                    {hs.description}
                  </div>

                  <div style={{ marginTop: 2 }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--pw-text-faint)',
                        marginBottom: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <ShieldCheck size={12} color="#10b981" />
                      <span>核心保护区与旗舰示范点：</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {hs.keyReserves.map((reserve) => (
                        <span
                          key={reserve}
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            color: '#a7f3d0',
                            fontSize: 9,
                          }}
                        >
                          {reserve}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
        </>
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

function getPolygonCentroid(polygon: GeoJSON.Polygon): [number, number] {
  const coords = polygon.coordinates[0];
  if (!coords || coords.length === 0) return [0, 0];
  let sumLng = 0;
  let sumLat = 0;
  const count = coords.length > 1 ? coords.length - 1 : coords.length;
  for (let i = 0; i < count; i++) {
    sumLng += coords[i]![0];
    sumLat += coords[i]![1];
  }
  return [sumLng / count, sumLat / count];
}

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

function renderHotspots(
  map: maplibregl.Map,
  hotspots: BiodiversityHotspot[],
  activeHotspotId: string | null,
) {
  for (const hotspot of hotspots) {
    const srcId = `${HOTSPOT_SRC_PREFIX}${hotspot.id}`;
    const fillId = `${HOTSPOT_FILL_PREFIX}${hotspot.id}`;
    const lineId = `${HOTSPOT_LINE_PREFIX}${hotspot.id}`;
    const symId = `${HOTSPOT_SYM_PREFIX}${hotspot.id}`;
    const isSelected = hotspot.id === activeHotspotId;
    const baseColor = hotspot.threatLevel === 'Critical' ? '#ef4444' : '#f59e0b';
    const centroid = getPolygonCentroid(hotspot.polygon);

    const geojson: GeoJSON.Feature = {
      type: 'Feature',
      geometry: hotspot.polygon,
      properties: {
        id: hotspot.id,
        name: hotspot.nameZh,
        threat: hotspot.threatLevel,
        species: hotspot.speciesRichness,
      },
    };

    map.addSource(srcId, { type: 'geojson', data: geojson });

    map.addLayer({
      id: fillId,
      source: srcId,
      type: 'fill',
      paint: {
        'fill-color': baseColor,
        'fill-opacity': isSelected ? 0.38 : 0.16,
      },
    });

    map.addLayer({
      id: lineId,
      source: srcId,
      type: 'line',
      paint: {
        'line-color': baseColor,
        'line-width': isSelected ? 3 : 1.5,
        'line-opacity': isSelected ? 0.95 : 0.7,
        'line-dasharray': [3, 2],
      },
    });

    // Centroid label
    const ptGeojson: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: centroid },
      properties: {
        name: hotspot.nameZh,
      },
    };
    const ptSrcId = `${srcId}-pt`;
    map.addSource(ptSrcId, { type: 'geojson', data: ptGeojson });
    map.addLayer({
      id: symId,
      source: ptSrcId,
      type: 'symbol',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-offset': [0, 0],
        'text-anchor': 'center',
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#0d1217',
        'text-halo-width': 2,
      },
    });
  }
}

function renderMigrationRoutes(map: maplibregl.Map, routes: MigrationRoute[]) {
  const routeColors: Record<string, string> = {
    eaaf: '#3498db',
    'arctic-tern': '#e74c3c',
    'monarch-butterfly': '#f39c12',
    wildebeest: '#2ecc71',
    'humpback-whale': '#9b59b6',
  };

  for (const route of routes) {
    const srcId = `${MIG_SRC_PREFIX}${route.id}`;
    const lyrId = `${MIG_LYR_PREFIX}${route.id}`;
    const color = routeColors[route.id] || '#00d2d3';

    const geojson: GeoJSON.Feature = {
      type: 'Feature',
      geometry: route.path,
      properties: { id: route.id, name: route.nameZh },
    };

    map.addSource(srcId, { type: 'geojson', data: geojson });
    map.addLayer({
      id: lyrId,
      source: srcId,
      type: 'line',
      paint: {
        'line-color': color,
        'line-width': 2.5,
        'line-opacity': 0.85,
        'line-dasharray': [4, 2],
      },
    });
  }

  // animated points
  const ptGeojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: routes.map((r) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: r.path.coordinates[0]! },
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
      'circle-stroke-color': '#000000',
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
    HOTSPOT_SRC_PREFIX,
    HOTSPOT_FILL_PREFIX,
    HOTSPOT_LINE_PREFIX,
    HOTSPOT_SYM_PREFIX,
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

