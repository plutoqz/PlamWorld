// components/visual/SunlightControl.tsx — 阳光阴影控制面板
// 日期 + 时间滑块 → 实时计算太阳位置 → 显示 azimuth/altitude

import { useState, useEffect, useCallback, useRef } from 'react';
import { Info, Moon, Pause, Play, Sun, SunMedium } from 'lucide-react';
import { getPosition } from 'suncalc';
import * as maplibregl from 'maplibre-gl';
import type { SunlightShadowTool } from '@tools/sunlight-shadow.tool';

const SUN_DEM_SOURCE = 'palm-sunlight-dem';
const SUN_HILLSHADE_LAYER = 'palm-sunlight-hillshade';
const TERRARIUM_TILES = [
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
];

interface SunlightControlProps {
  tool: SunlightShadowTool;
}

export function SunlightControl({ tool }: SunlightControlProps) {
  const [date, setDate] = useState(tool.date);
  const [playing, setPlaying] = useState(tool.playing);
  const [sunPos, setSunPos] = useState<{ azimuth: number; altitude: number } | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    tool.setOnStateChange(() => {
      setDate(tool.date);
      setPlaying(tool.playing);
    });
    return () => tool.setOnStateChange(null);
  }, [tool]);

  // Compute sun position for center of viewport (use Beijing as default)
  useEffect(() => {
    try {
      const engine = tool.engine;
      const center: [number, number] = engine ? engine.getCenter() : [116.4, 39.9];
      const pos = getPosition(date, center[1], center[0]);
      setSunPos({ azimuth: (pos.azimuth + 360) % 360, altitude: pos.altitude });
    } catch {
      setSunPos(null);
    }
  }, [date, tool]);

  useEffect(() => {
    const map = tool.engine?.getNative() as maplibregl.Map | null;
    if (!map || !sunPos) return;
    mapRef.current = map;

    const render = () => applySunlight(map, sunPos.azimuth, sunPos.altitude);
    render();
    map.on('style.load', render);
    return () => {
      map.off('style.load', render);
    };
  }, [sunPos, tool]);

  useEffect(() => () => {
    const map = mapRef.current;
    if (!map) return;
    try { if (map.getLayer(SUN_HILLSHADE_LAYER)) map.removeLayer(SUN_HILLSHADE_LAYER); } catch { /* */ }
    try { if (map.getSource(SUN_DEM_SOURCE)) map.removeSource(SUN_DEM_SOURCE); } catch { /* */ }
  }, [tool]);

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeLabel = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  const handleTimeSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const totalMins = Number(e.target.value);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      const d = new Date(date);
      d.setHours(h, m, 0, 0);
      tool.setDate(d);
    },
    [date, tool],
  );

  const altitude = sunPos?.altitude ?? 0;
  const darkness = altitude < -6 ? 0.58 : altitude < 5 ? 0.38 : altitude < 15 ? 0.16 : 0.04;

  return (
    <>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 700, pointerEvents: 'none',
        background: altitude < 5
          ? `rgba(4, 12, 34, ${darkness})`
          : `rgba(255, 177, 66, ${darkness})`,
        transition: 'background 180ms linear',
      }} />
      <div className="pw-panel-stack">
      <div className="pw-panel-footer">
        <span className="pw-panel-status"><Sun size={14} />太阳位置</span>
        <strong style={{ color: 'var(--pw-warning)', font: '700 14px ui-monospace, SFMono-Regular, Consolas, monospace' }}>{timeLabel}</strong>
      </div>

      {/* Time slider */}
      <input
        type="range"
        min={0}
        max={1439}
        value={hours * 60 + minutes}
        onChange={handleTimeSlider}
        style={{ width: '100%' }}
      />

      {/* Date picker */}
      <input
        type="date"
        value={date.toISOString().slice(0, 10)}
        onChange={(e) => {
          const d = new Date(e.target.value);
          d.setHours(date.getHours(), date.getMinutes());
          tool.setDate(d);
        }}
        className="pw-secondary-button"
      />

      {/* Sun position */}
      {sunPos && (
        <div className="pw-panel-toolbar">
          <span>方位角: {sunPos.azimuth.toFixed(1)}°</span>
          <span>高度角: {sunPos.altitude.toFixed(1)}°</span>
          {sunPos.altitude < 0 && <span className="pw-panel-status is-danger"><Moon size={13} />太阳在地平线下</span>}
          {sunPos.altitude > 0 && <span className="pw-panel-status is-warning"><SunMedium size={13} />日照中</span>}
        </div>
      )}

      {/* Play button */}
      <div className="pw-panel-toolbar">
        <button
          type="button"
          onClick={() => tool.setPlaying(!playing)}
          className={playing ? 'pw-danger-button' : 'pw-primary-button'}
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
          {playing ? '暂停' : '播放'}
        </button>
        <label className="pw-panel-status">
          速度:
          <select
            value={tool.playSpeed}
            onChange={(e) => tool.setPlaySpeed(Number(e.target.value))}
            className="pw-secondary-button"
          >
            <option value={15}>15分/秒</option>
            <option value={30}>30分/秒</option>
            <option value={60}>1时/秒</option>
          </select>
        </label>
      </div>

      <div className="pw-panel-note">
        <Info size={14} /><span>拖拽滑块模拟日照变化，结合地形 hillshade 可视化。</span>
      </div>
      </div>
    </>
  );
}

function applySunlight(map: maplibregl.Map, azimuth: number, altitude: number): void {
  try {
    if (!map.getSource(SUN_DEM_SOURCE)) {
      map.addSource(SUN_DEM_SOURCE, {
        type: 'raster-dem',
        encoding: 'terrarium',
        tiles: TERRARIUM_TILES,
        tileSize: 256,
        maxzoom: 15,
      });
    }
    if (!map.getLayer(SUN_HILLSHADE_LAYER)) {
      map.addLayer({
        id: SUN_HILLSHADE_LAYER,
        type: 'hillshade',
        source: SUN_DEM_SOURCE,
        paint: {
          'hillshade-illumination-anchor': 'map',
          'hillshade-exaggeration': 0.75,
        },
      });
    }

    map.setPaintProperty(SUN_HILLSHADE_LAYER, 'hillshade-illumination-direction', azimuth);
    map.setPaintProperty(
      SUN_HILLSHADE_LAYER,
      'hillshade-exaggeration',
      altitude <= 0 ? 1 : Math.max(0.45, 1 - altitude / 140),
    );
    map.setPaintProperty(
      SUN_HILLSHADE_LAYER,
      'hillshade-shadow-color',
      altitude <= 0 ? 'rgba(0, 5, 18, 0.95)' : 'rgba(18, 28, 52, 0.82)',
    );
    map.setPaintProperty(
      SUN_HILLSHADE_LAYER,
      'hillshade-highlight-color',
      altitude <= 0 ? 'rgba(70, 92, 130, 0.18)' : 'rgba(255, 235, 180, 0.78)',
    );
  } catch (error) {
    console.warn('[Sunlight] hillshade update failed:', error);
  }
}
