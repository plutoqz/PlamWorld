// components/panels/sub/MeasurePanel.tsx — 测量面板

import { useState, useEffect } from 'react';
import { CheckCircle2, MousePointer2, RotateCcw, Ruler, Shapes } from 'lucide-react';
import type { MeasureTool } from '@tools/measure.tool';
import type { MeasureMode } from '@tools/measure.tool';
import type { LngLat } from '@core/types';

interface Props {
  tool: MeasureTool;
}

export function MeasurePanel({ tool }: Props) {
  const [mode, setMode] = useState<MeasureMode>('distance');
  const [points, setPoints] = useState<LngLat[]>([]);
  const [distance, setDistance] = useState<number | null>(null);
  const [area, setArea] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [distanceUnit, setDistanceUnit] = useState<'m' | 'km'>('m');
  const [areaUnit, setAreaUnit] = useState<'m2' | 'km2'>('m2');

  useEffect(() => {
    const check = setInterval(() => {
      setPoints([...tool.getPoints()]);
      setDistance(tool.getDistance());
      setArea(tool.getArea());
      setFinished(tool.isFinished());
    }, 250);
    return () => clearInterval(check);
  }, [tool]);

  const handleModeChange = (newMode: MeasureMode) => {
    tool.setMode(newMode);
    setMode(newMode);
    setPoints([]);
    setDistance(null);
    setArea(null);
    setFinished(false);
  };

  const handleReset = () => {
    tool.reset();
    setPoints([]);
    setDistance(null);
    setArea(null);
    setFinished(false);
  };

  const fmt = (m: number) =>
    distanceUnit === 'km' ? `${(m / 1000).toFixed(5)} km` : `${m.toFixed(2)} m`;
  const fmtArea = (m2: number) =>
    areaUnit === 'km2' ? `${(m2 / 1_000_000).toFixed(6)} km²` : `${m2.toFixed(2)} m²`;

  const hint =
    points.length === 0
      ? '单击地图开始采集'
      : points.length < (mode === 'area' ? 3 : 2)
        ? `还需 ${(mode === 'area' ? 3 : 2) - points.length} 个点 — 双击或 Enter 完成`
        : finished
          ? '测量完成，可重置后重新采集'
          : '双击地图或按 Enter 完成测量';

  return (
    <div className="pw-panel-stack">
      <div className="pw-segmented" aria-label="测量模式">
        <button
          type="button"
          onClick={() => handleModeChange('distance')}
          className={mode === 'distance' ? 'is-active' : ''}
        >
          <Ruler size={15} />测距
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('area')}
          className={mode === 'area' ? 'is-active' : ''}
        >
          <Shapes size={15} />测面积
        </button>
      </div>

      {distance !== null && (
        <div className="pw-metric-block">
          <div className="pw-metric-grid">
            <div className="pw-metric-item is-accent">
              <small>距离</small>
              <strong>{fmt(distance)}</strong>
            </div>
            {area !== null && (
              <div className="pw-metric-item is-warning">
                <small>面积</small>
                <strong>{fmtArea(area)}</strong>
              </div>
            )}
          </div>
          <div className="pw-unit-row">
            <span>距离单位</span>
            {(['m', 'km'] as const).map((u) => (
              <button
                type="button"
                key={u}
                onClick={() => setDistanceUnit(u)}
                className={distanceUnit === u ? 'is-active' : ''}
              >
                {u === 'm' ? '米' : '千米'}
              </button>
            ))}
            {area !== null && (
              <>
                <span>面积单位</span>
                {(['m2', 'km2'] as const).map((u) => (
                  <button
                    type="button"
                    key={u}
                    onClick={() => setAreaUnit(u)}
                    className={areaUnit === u ? 'is-active' : ''}
                  >
                    {u === 'm2' ? 'm²' : 'km²'}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      <div className={`pw-panel-status ${finished ? 'is-success' : ''}`}>
        {finished ? <CheckCircle2 size={14} /> : <MousePointer2 size={14} />}
        <span>{hint}</span>
      </div>

      <div className="pw-panel-footer">
        <span>
          {points.length} 点 · Enter 完成 · Esc 撤销
        </span>
        {points.length > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="pw-secondary-button"
          >
            <RotateCcw size={13} />重置
          </button>
        )}
      </div>
    </div>
  );
}
