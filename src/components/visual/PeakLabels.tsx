// components/visual/PeakLabels.tsx — 峰顶识别交互面板
// 点击地图放置视点 → 显示可见山峰列表 → 点击标签飞向山峰

import { useState, useEffect, useCallback, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { AlertCircle, LoaderCircle, MousePointer2 } from 'lucide-react';
import type { PeakFinderTool, PeakInfo } from '@tools/peak-finder.tool';
import type { LngLat } from '@core/types';

interface PeakLabelsProps {
  tool: PeakFinderTool;
}

export function PeakLabels({ tool }: PeakLabelsProps) {
  const [viewPoint, setViewPoint] = useState<LngLat | null>(tool.viewPoint);
  const [peaks, setPeaks] = useState<PeakInfo[]>(tool.peaks);
  const [observerHeight, setObserverHeight] = useState(tool.observerHeight);
  const [radius, setRadius] = useState(tool.searchRadius);
  const [searching, setSearching] = useState(tool.searching);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    tool.setOnStateChange(() => {
      setViewPoint(tool.viewPoint);
      setPeaks([...tool.peaks]);
      setSearching(tool.searching);
    });
    return () => tool.setOnStateChange(null);
  }, [tool]);

  const handleGoTo = useCallback((peak: PeakInfo) => {
    const engine = tool.engine;
    if (engine) {
      engine.flyTo([peak.lng, peak.lat], 12, { duration: 2000 });
    }
  }, [tool]);

  // Listen for map clicks to set view point
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const native = engine.getNative() as { on: (e: string, cb: (ev: unknown) => void) => void; off: (e: string, cb: (ev: unknown) => void) => void } | null;
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

  useEffect(() => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    const map = tool.engine?.getNative() as maplibregl.Map | null;
    if (!map) return;

    if (viewPoint) {
      const element = document.createElement('div');
      element.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#ffeb3b;border:3px solid #111;box-shadow:0 0 0 3px rgba(255,235,59,.25);';
      markersRef.current.push(new maplibregl.Marker({ element }).setLngLat(viewPoint).addTo(map));
    }

    peaks.forEach((peak) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.title = `定位到${peak.name}`;
      element.style.cssText = [
        'border:2px solid #fff',
        'border-radius:4px',
        `background:${peak.source === 'dem' ? '#ef4444' : '#263238'}`,
        'color:#fff',
        'padding:4px 7px',
        'font:700 11px sans-serif',
        'white-space:nowrap',
        'box-shadow:0 2px 8px rgba(0,0,0,.55)',
        'cursor:pointer',
      ].join(';');
      element.textContent = `${peak.name} ${peak.elevation.toFixed(0)}m`;
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        handleGoTo(peak);
      });
      markersRef.current.push(
        new maplibregl.Marker({ element, anchor: 'bottom', offset: [0, -5] })
          .setLngLat([peak.lng, peak.lat])
          .addTo(map),
      );
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [handleGoTo, peaks, tool, viewPoint]);

  const visiblePeaks = peaks.filter((p) => p.visible);
  const hiddenPeaks = peaks.filter((p) => !p.visible);

  const bearingLabel = (deg: number) => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  };

  return (
    <div className="pw-panel-stack">
      <div className="pw-control-row">
        <label>观察高度</label>
        <input type="range" min={1} max={300} value={observerHeight}
          onChange={(e) => { setObserverHeight(Number(e.target.value)); tool.setObserverHeight(Number(e.target.value)); }}
          style={{ width: '100%' }} />
        <output>{observerHeight} m</output>
      </div>

      <div className="pw-control-row">
        <label>搜索半径</label>
        <input type="range" min={10} max={200} value={radius}
          onChange={(e) => { setRadius(Number(e.target.value)); tool.setSearchRadius(Number(e.target.value)); }}
          style={{ width: '100%' }} />
        <output>{radius} km</output>
      </div>

      {!viewPoint && (
        <div className="pw-panel-status">
          <MousePointer2 size={14} /><span>点击地图放置观察点</span>
        </div>
      )}

      {viewPoint && searching && (
        <div className="pw-panel-status is-warning">
          <LoaderCircle size={14} /><span>峰库无匹配，正在搜索当前区域最高点</span>
        </div>
      )}

      {viewPoint && !searching && peaks.length === 0 && (
        <div className="pw-panel-status is-danger">
          <AlertCircle size={14} /><span>当前区域没有可用高程数据</span>
        </div>
      )}

      {/* Visible peaks */}
      {visiblePeaks.length > 0 && (
        <>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>可见山峰 ({visiblePeaks.length})</div>
          {visiblePeaks.map((p, i) => (
            <PeakRow key={i} peak={p} bearingLabel={bearingLabel} onClick={() => handleGoTo(p)} />
          ))}
        </>
      )}

      {/* Hidden peaks (collapsed) */}
      {hiddenPeaks.length > 0 && (
        <details>
          <summary style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', cursor: 'pointer' }}>
            被遮挡 / 超出距离 ({hiddenPeaks.length})
          </summary>
          {hiddenPeaks.map((p, i) => (
            <PeakRow key={i} peak={p} bearingLabel={bearingLabel} onClick={() => handleGoTo(p)} dimmed />
          ))}
        </details>
      )}
    </div>
  );
}

function PeakRow({ peak, bearingLabel, onClick, dimmed }: {
  peak: PeakInfo; bearingLabel: (d: number) => string; onClick: () => void; dimmed?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 10px', border: 'none', borderRadius: 6,
      background: 'rgba(255,255,255,0.03)', cursor: 'pointer',
      opacity: dimmed ? 0.4 : 1,
      textAlign: 'left', fontFamily: 'inherit', width: '100%',
    }}>
      <div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{peak.name}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
          {peak.elevation.toLocaleString()}m · {peak.distance.toFixed(1)}km · {bearingLabel(peak.bearing)}
          {peak.source === 'dem' ? ' · DEM 最高点' : ''}
        </div>
      </div>
    </button>
  );
}
