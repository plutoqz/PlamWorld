// components/panels/FlyPanel.tsx — 可控 3D 地形巡航

import { useState, useEffect, useCallback, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { ArrowDown, ArrowUp, Play, Redo2, Square, Undo2 } from 'lucide-react';
import type { FlyTool } from '../../tools/fly.tool';

interface Props { tool: FlyTool; }

export function FlyPanel({ tool }: Props) {
  const [flying, setFlying] = useState(false);
  const [pitch, setPitch] = useState(65);
  const [speed, setSpeed] = useState(0.5);
  const [bearing, setBearing] = useState(0);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const bearingRef = useRef(0);

  useEffect(() => {
    const map = tool.engine?.getNative() as maplibregl.Map | null;
    if (!map) return;
    mapRef.current = map;
    const currentBearing = normalizeBearing(map.getBearing());
    bearingRef.current = currentBearing;
    setBearing(currentBearing);

    const stopCruise = (event: maplibregl.MapMovementEvent) => {
      if (event.originalEvent) setFlying(false);
    };
    map.on('dragstart', stopCruise);
    map.on('rotatestart', stopCruise);
    return () => {
      map.off('dragstart', stopCruise);
      map.off('rotatestart', stopCruise);
      cancelAnimationFrame(rafRef.current);
      mapRef.current = null;
    };
  }, [tool]);

  const move = useCallback((distanceKm: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.jumpTo({ center: destination(map.getCenter(), bearingRef.current, distanceKm) });
  }, []);

  const turn = useCallback((degrees: number) => {
    const next = normalizeBearing(bearingRef.current + degrees);
    bearingRef.current = next;
    setBearing(next);
    mapRef.current?.easeTo({ bearing: next, duration: 220 });
  }, []);

  useEffect(() => {
    if (!flying) {
      cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = 0;
      return;
    }

    const tick = (timestamp: number) => {
      if (lastFrameRef.current > 0) {
        const elapsedSeconds = Math.min(0.1, (timestamp - lastFrameRef.current) / 1000);
        move(speed * elapsedSeconds);
      }
      lastFrameRef.current = timestamp;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [flying, move, speed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.key.toLowerCase() === 'w') move(speed * 0.25);
      if (event.key.toLowerCase() === 's') move(-speed * 0.25);
      if (event.key.toLowerCase() === 'a') turn(-12);
      if (event.key.toLowerCase() === 'd') turn(12);
      if (event.key === ' ') {
        event.preventDefault();
        setFlying((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [move, speed, turn]);

  const handlePitchChange = (value: number) => {
    setPitch(value);
    mapRef.current?.easeTo({ pitch: value, duration: 120 });
  };

  return (
    <div className="pw-panel-stack">
      <div className="pw-metric-block">
        <div className="pw-metric-grid">
          <div className="pw-metric-item is-accent">
            <small>当前航向</small>
            <strong>{bearing.toFixed(0)}°</strong>
          </div>
          <div className="pw-metric-item">
            <small>巡航状态</small>
            <strong>{flying ? '运行中' : '已停止'}</strong>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setFlying((value) => !value)}
        className={flying ? 'pw-danger-button' : 'pw-primary-button'}
      >
        {flying ? <Square size={14} /> : <Play size={14} />}
        {flying ? '停止巡航' : '开始巡航'}
      </button>

      <div className="pw-direction-pad">
        <IconButton label="左转" onClick={() => turn(-15)}><Undo2 size={17} /></IconButton>
        <IconButton label="向前" onClick={() => move(speed * 0.25)}><ArrowUp size={17} /></IconButton>
        <IconButton label="右转" onClick={() => turn(15)}><Redo2 size={17} /></IconButton>
        <span />
        <IconButton label="向后" onClick={() => move(-speed * 0.25)}><ArrowDown size={17} /></IconButton>
        <span />
      </div>

      <SliderRow label="俯仰" value={`${pitch.toFixed(0)}°`}>
        <input type="range" min={20} max={85} value={pitch} onChange={(e) => handlePitchChange(Number(e.target.value))}
          style={{ width: '100%', cursor: 'pointer' }} />
      </SliderRow>
      <SliderRow label="速度" value={`${speed.toFixed(1)} km/s`}>
        <input type="range" min={0.1} max={2} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
          style={{ width: '100%', cursor: 'pointer' }} />
      </SliderRow>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick}>{children}</button>
  );
}

function SliderRow({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="pw-control-row">
      <label>{label}</label>
      {children}
      <output>{value}</output>
    </div>
  );
}

function normalizeBearing(value: number): number {
  return (value % 360 + 360) % 360;
}

function destination(center: maplibregl.LngLat, bearingDeg: number, distanceKm: number): [number, number] {
  const angularDistance = distanceKm / 6371;
  const bearing = bearingDeg * Math.PI / 180;
  const lat1 = center.lat * Math.PI / 180;
  const lng1 = center.lng * Math.PI / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );
  return [((lng2 * 180 / Math.PI + 540) % 360) - 180, lat2 * 180 / Math.PI];
}
