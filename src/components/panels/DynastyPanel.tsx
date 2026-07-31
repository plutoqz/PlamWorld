// components/panels/DynastyPanel.tsx — 古代疆域面板 (v0.6)
//
// 底部时间轴 + 疆域 Polygon 叠加

import { useState, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { RotateCcw } from 'lucide-react';
import type { DynastyOverlayTool } from '../../tools/dynasty-overlay.tool';
import type { DynastyDef } from '../../core/dynasty';

// ---- constants ----
const DYN_SRC_PREFIX = 'palm-dynasty-';
const DYN_LYR_PREFIX = 'palm-dynasty-lyr-';
const DYN_LINE_LYR_PREFIX = 'palm-dynasty-line-';
const CMP_SRC_PREFIX = 'palm-dynasty-cmp-';
const CMP_LYR_PREFIX = 'palm-dynasty-cmp-lyr-';
const CMP_LINE_PREFIX = 'palm-dynasty-cmp-line-';

interface DynastyPanelProps {
  tool: DynastyOverlayTool;
}

export function DynastyPanel({ tool }: DynastyPanelProps) {
  const [activeId, setActiveId] = useState<string | null>(tool.state.activeDynastyId);
  const [opacity, setOpacity] = useState(tool.state.opacity);
  const [showAll, setShowAll] = useState(tool.state.showAll);
  const [compareId, setCompareId] = useState<string | null>(tool.state.compareDynastyId);
  const [compareOpacity, setCompareOpacity] = useState(tool.state.compareOpacity);
  const [hoverDynasty, setHoverDynasty] = useState<DynastyDef | null>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const dynasties = tool.getAllDynasties();

  // sync
  useEffect(() => {
    const onStateChange = () => {
      setActiveId(tool.state.activeDynastyId);
      setOpacity(tool.state.opacity);
      setShowAll(tool.state.showAll);
      setCompareId(tool.state.compareDynastyId);
      setCompareOpacity(tool.state.compareOpacity);
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
    };
  }, []);

  // render layers when state changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    cleanupAll(map);

    if (showAll) {
      dynasties.forEach((d) =>
        renderDynasty(map, d, 0.18, DYN_SRC_PREFIX, DYN_LYR_PREFIX, DYN_LINE_LYR_PREFIX),
      );
    } else if (activeId) {
      const d = tool.getActiveDynasty();
      if (d) renderDynasty(map, d, opacity, DYN_SRC_PREFIX, DYN_LYR_PREFIX, DYN_LINE_LYR_PREFIX);

      // 对比模式
      if (compareId) {
        const c = tool.getCompareDynasty();
        if (c)
          renderDynasty(map, c, compareOpacity, CMP_SRC_PREFIX, CMP_LYR_PREFIX, CMP_LINE_PREFIX);
      }
    }
  }, [activeId, opacity, showAll, compareId, compareOpacity, dynasties]);

  // handle time slider click
  function handleDynastyClick(id: string) {
    if (activeId === id) {
      tool.setActiveDynasty(null);
    } else {
      tool.setActiveDynasty(id);
      // 自动 flyTo 该朝代疆域中心
      const d = dynasties.find((dd) => dd.id === id);
      if (d && mapRef.current) {
        const coords =
          d.geometry.type === 'Polygon'
            ? d.geometry.coordinates[0]!
            : d.geometry.coordinates[0]![0]!;
        const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
        const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
        mapRef.current.flyTo({ center: [lng, lat], zoom: 4, duration: 1500 });
      }
    }
  }

  return (
    <div className="pw-panel-stack">
      {/* timeline — 底部时间轴风格的横向朝代选择器 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontSize: 10, color: 'var(--pw-text-muted)' }}>朝代时间轴</label>
        <div
          style={{
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
            padding: '4px 0',
          }}
        >
          {dynasties.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => handleDynastyClick(d.id)}
              onMouseEnter={() => setHoverDynasty(d)}
              onMouseLeave={() => setHoverDynasty(null)}
              style={{
                flex: '0 0 auto',
                padding: '6px 12px',
                border: `2px solid ${activeId === d.id ? d.color : 'var(--pw-border)'}`,
                borderRadius: 6,
                background: activeId === d.id ? `${d.color}33` : '#0d1217',
                color: 'var(--pw-text)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: activeId === d.id ? 600 : 400,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ color: d.color, fontWeight: 600 }}>{d.nameZh}</span>
              <span style={{ fontSize: 9, color: 'var(--pw-text-faint)' }}>
                {d.yearRange[0] < 0 ? `公元前${-d.yearRange[0]}` : `${d.yearRange[0]}年`}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* hover 信息 */}
      {hoverDynasty && (
        <div
          style={{
            padding: 8,
            borderRadius: 4,
            background: '#0d1217',
            border: `1px solid ${hoverDynasty.color}44`,
            fontSize: 11,
          }}
        >
          <div style={{ fontWeight: 600, color: hoverDynasty.color }}>
            {hoverDynasty.nameZh} (
            {hoverDynasty.yearRange[0] < 0
              ? `前${-hoverDynasty.yearRange[0]}`
              : hoverDynasty.yearRange[0]}
            年)
          </div>
          <div style={{ color: 'var(--pw-text-muted)', marginTop: 2 }}>
            {hoverDynasty.description}
          </div>
        </div>
      )}

      {/* 主动朝代信息 */}
      {activeId && tool.getActiveDynasty() && (
        <div
          style={{
            padding: 8,
            borderRadius: 4,
            background: '#0d1217',
            border: `1px solid ${tool.getActiveDynasty()!.color}88`,
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600, color: tool.getActiveDynasty()!.color }}>
            {tool.getActiveDynasty()!.nameZh} ({tool.getActiveDynasty()!.yearRange[0]}–
            {tool.getActiveDynasty()!.yearRange[1]})
          </div>
          <div style={{ color: 'var(--pw-text-muted)', marginTop: 4 }}>
            {tool.getActiveDynasty()!.description}
          </div>
        </div>
      )}

      {/* 透明度 */}
      {activeId && (
        <div className="pw-control-row">
          <label>疆域透明度</label>
          <input
            type="range"
            min={5}
            max={80}
            value={Math.round(opacity * 100)}
            onChange={(e) => tool.setOpacity(Number(e.target.value) / 100)}
            style={{ width: '100%', cursor: 'pointer' }}
          />
          <output>{Math.round(opacity * 100)}%</output>
        </div>
      )}

      {/* 全部显示 */}
      <div className="pw-control-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => tool.setShowAll(e.target.checked)}
          />
          同时显示全部朝代
        </label>
      </div>

      {/* 对比模式 */}
      {activeId && !showAll && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 10, color: 'var(--pw-text-muted)' }}>对比朝代</label>
          <select
            value={compareId ?? ''}
            onChange={(e) => tool.setCompareDynasty(e.target.value || null)}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--pw-border)',
              borderRadius: 4,
              background: '#11161a',
              color: 'var(--pw-text)',
              fontSize: 12,
            }}
          >
            <option value="">无对比</option>
            {dynasties
              .filter((d) => d.id !== activeId)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nameZh}
                </option>
              ))}
          </select>
          {compareId && (
            <div className="pw-control-row">
              <label>对比透明度</label>
              <input
                type="range"
                min={5}
                max={60}
                value={Math.round(compareOpacity * 100)}
                onChange={(e) => tool.setCompareOpacity(Number(e.target.value) / 100)}
                style={{ width: '100%', cursor: 'pointer' }}
              />
              <output>{Math.round(compareOpacity * 100)}%</output>
            </div>
          )}
        </div>
      )}

      {/* 操作 */}
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

// ---- render helpers ----

function renderDynasty(
  map: maplibregl.Map,
  dynasty: DynastyDef,
  opacity: number,
  srcPrefix: string,
  lyrPrefix: string,
  linePrefix: string,
) {
  const srcId = `${srcPrefix}${dynasty.id}`;
  const lyrId = `${lyrPrefix}${dynasty.id}`;
  const lineId = `${linePrefix}${dynasty.id}`;

  const geojson: GeoJSON.Feature = {
    type: 'Feature',
    geometry: dynasty.geometry,
    properties: { id: dynasty.id, name: dynasty.nameZh },
  };

  map.addSource(srcId, { type: 'geojson', data: geojson });

  map.addLayer({
    id: lyrId,
    source: srcId,
    type: 'fill',
    paint: {
      'fill-color': dynasty.color,
      'fill-opacity': opacity,
    },
  });

  map.addLayer({
    id: lineId,
    source: srcId,
    type: 'line',
    paint: {
      'line-color': dynasty.color,
      'line-width': 1.5,
      'line-opacity': Math.min(1, opacity + 0.2),
    },
  });
}

function cleanupAll(map: maplibregl.Map) {
  const prefixes = [
    DYN_SRC_PREFIX,
    DYN_LYR_PREFIX,
    DYN_LINE_LYR_PREFIX,
    CMP_SRC_PREFIX,
    CMP_LYR_PREFIX,
    CMP_LINE_PREFIX,
  ];
  for (const prefix of prefixes) {
    const style = map.getStyle();
    if (!style) continue;
    for (const layer of style.layers ?? []) {
      if (layer.id.startsWith(prefix))
        try {
          map.removeLayer(layer.id);
        } catch {
          /* */
        }
    }
    for (const srcId of Object.keys(style.sources ?? {})) {
      if (srcId.startsWith(prefix))
        try {
          map.removeSource(srcId);
        } catch {
          /* */
        }
    }
  }
}
