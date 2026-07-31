// components/panels/GeoGuessrPanel.tsx — 独立概览图猜地点

import { useState, useEffect, useCallback, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { geoEqualEarth, geoPath, type GeoProjection } from 'd3-geo';
import type { FeatureCollection } from 'geojson';
import type { GeoGuessrTool, GeoGuessrRound } from '@tools/geoguessr.tool';
import type { LngLat } from '@core/types';
import countriesData from '../../data/boundaries/countries-110m.json';

interface GeoGuessrPanelProps { tool: GeoGuessrTool; }

const RESULT_SOURCE_ID = 'palm-geoguessr-result-src';
const RESULT_LAYER_ID = 'palm-geoguessr-result-line';

export function GeoGuessrPanel({ tool }: GeoGuessrPanelProps) {
  const [phase, setPhase] = useState(tool.phase);
  const [currentRound, setCurrentRound] = useState(tool.currentRound);
  const [totalRounds, setTotalRounds] = useState(tool.totalRounds);
  const [rounds, setRounds] = useState<GeoGuessrRound[]>(tool.rounds);
  const [totalScore, setTotalScore] = useState(0);
  const [lastResult, setLastResult] = useState<GeoGuessrRound | null>(null);
  const [selectedGuess, setSelectedGuess] = useState<LngLat | null>(null);
  const resultMarkersRef = useRef<maplibregl.Marker[]>([]);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    mapRef.current = tool.engine?.getNative() as maplibregl.Map | null;
    tool.setOnStateChange(() => {
      setPhase(tool.phase);
      setCurrentRound(tool.currentRound);
      setTotalRounds(tool.totalRounds);
      setRounds([...tool.rounds]);
      setTotalScore(tool.totalScore);
    });
    return () => tool.setOnStateChange(null);
  }, [tool]);

  const clearResultMap = useCallback(() => {
    resultMarkersRef.current.forEach((marker) => marker.remove());
    resultMarkersRef.current = [];
    const map = mapRef.current;
    if (!map) return;
    try { if (map.getLayer(RESULT_LAYER_ID)) map.removeLayer(RESULT_LAYER_ID); } catch { /* */ }
    try { if (map.getSource(RESULT_SOURCE_ID)) map.removeSource(RESULT_SOURCE_ID); } catch { /* */ }
  }, []);

  useEffect(() => clearResultMap, [clearResultMap]);

  const showResultOnMap = useCallback((result: GeoGuessrRound) => {
    const map = mapRef.current;
    if (!map || !result.guess) return;
    clearResultMap();

    resultMarkersRef.current = [
      new maplibregl.Marker({ color: '#3b82f6' }).setLngLat(result.guess).addTo(map),
      new maplibregl.Marker({ color: '#ef4444' })
        .setLngLat([result.location.lng, result.location.lat])
        .addTo(map),
    ];
    map.addSource(RESULT_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [result.guess, [result.location.lng, result.location.lat]],
        },
      },
    });
    map.addLayer({
      id: RESULT_LAYER_ID,
      type: 'line',
      source: RESULT_SOURCE_ID,
      paint: { 'line-color': '#fff', 'line-width': 3, 'line-dasharray': [2, 2] },
    });

    const west = Math.min(result.guess[0], result.location.lng);
    const east = Math.max(result.guess[0], result.location.lng);
    const south = Math.min(result.guess[1], result.location.lat);
    const north = Math.max(result.guess[1], result.location.lat);
    map.fitBounds([[west, south], [east, north]], { padding: 100, maxZoom: 8, duration: 900 });
  }, [clearResultMap]);

  const submitGuess = () => {
    if (!selectedGuess) return;
    const result = tool.submitGuess(selectedGuess);
    setLastResult(result);
    showResultOnMap(result);
  };

  const handleNextRound = () => {
    clearResultMap();
    setLastResult(null);
    setSelectedGuess(null);
    tool.nextRound();
  };

  const formatDist = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m.toFixed(0)} m`;

  return (
    <div className="pw-panel-stack">
      {phase !== 'idle' && (
        <div className="pw-panel-footer">
          <span>第 {currentRound + 1}/{totalRounds} 轮</span>
          <span>{totalScore} 分</span>
        </div>
      )}

      {phase === 'idle' && (
        <div className="pw-segmented" aria-label="地点类型">
          {(['global', 'china', 'nature'] as const).map((category) => (
            <button type="button" key={category} onClick={() => { clearResultMap(); tool.startGame(category); }}>
              {category === 'global' ? '全球' : category === 'china' ? '中国' : '自然'}
            </button>
          ))}
        </div>
      )}

      {phase === 'exploring' && (
        <button type="button" onClick={() => tool.startGuessing()} className="pw-primary-button">
          打开猜测地图
        </button>
      )}

      {phase === 'guessing' && (
        <>
          <GuessMap value={selectedGuess} onSelect={setSelectedGuess} />
          <button type="button" disabled={!selectedGuess} onClick={submitGuess} className="pw-primary-button">
            提交猜测{selectedGuess ? ` · ${selectedGuess[1].toFixed(2)}°, ${selectedGuess[0].toFixed(2)}°` : ''}
          </button>
        </>
      )}

      {phase === 'result' && lastResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, textAlign: 'center' }}>
          <div className="pw-metric-item is-accent"><small>本轮得分</small><strong>{lastResult.score} 分</strong></div>
          <div className="pw-panel-note">
            相距 {formatDist(lastResult.distance)} · 答案是 {lastResult.location.name}
          </div>
          <button type="button" onClick={handleNextRound} className="pw-primary-button">
            {currentRound < totalRounds - 1 ? '下一轮' : '查看总分'}
          </button>
        </div>
      )}

      {phase === 'idle' && rounds.length > 0 && (
        <div style={{ display: 'grid', gap: 4, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
          {rounds.map((round, index) => (
            <div key={`${round.location.name}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
              <span>#{index + 1} {round.location.name}</span><span>{round.score} 分</span>
            </div>
          ))}
          <strong style={{ color: 'var(--pw-accent)', textAlign: 'center', marginTop: 5 }}>总分 {totalScore}</strong>
        </div>
      )}
    </div>
  );
}

function GuessMap({ value, onSelect }: { value: LngLat | null; onSelect: (value: LngLat) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectionRef = useRef<GeoProjection | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const countries = countriesData as unknown as FeatureCollection;
    const projection = geoEqualEarth().fitExtent([[8, 8], [canvas.width - 8, canvas.height - 8]], countries);
    projectionRef.current = projection;
    const path = geoPath(projection, context);

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#17384f';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#648e5c';
    context.strokeStyle = 'rgba(255,255,255,.5)';
    context.lineWidth = 0.6;
    for (const feature of countries.features) {
      context.beginPath();
      path(feature);
      context.fill();
      context.stroke();
    }
    if (value) {
      const point = projection(value);
      if (point) {
        context.strokeStyle = '#ffeb3b';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(point[0] - 7, point[1]);
        context.lineTo(point[0] + 7, point[1]);
        context.moveTo(point[0], point[1] - 7);
        context.lineTo(point[0], point[1] + 7);
        context.stroke();
      }
    }
  }, [value]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const projection = projectionRef.current;
    if (!canvas || !projection) return;
    const rect = canvas.getBoundingClientRect();
    const point: [number, number] = [
      (event.clientX - rect.left) * canvas.width / rect.width,
      (event.clientY - rect.top) * canvas.height / rect.height,
    ];
    const coordinate = projection.invert?.(point);
    if (coordinate) onSelect([coordinate[0], coordinate[1]]);
  };

  return <canvas ref={canvasRef} width={344} height={190} onClick={handleClick} aria-label="猜测位置概览图" style={{ width: '100%', aspectRatio: '344 / 190', border: '1px solid rgba(255,255,255,.16)', borderRadius: 5, cursor: 'crosshair' }} />;
}
