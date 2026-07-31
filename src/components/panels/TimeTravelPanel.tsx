// components/panels/TimeTravelPanel.tsx — 时空穿梭面板
// 年份滑块切换不同时期的卫星图源

import { useState, useEffect, useCallback } from 'react';
import { getEngine } from '../../hooks/useMap';
import { sourceRegistry } from '../../sources/registry';
import type { TimeTravelTool } from '../../tools/time-travel.tool';

interface Props {
  tool: TimeTravelTool;
}

export function TimeTravelPanel({ tool }: Props) {
  const [year, setYear] = useState(tool.year);
  const sources = tool.sources;

  useEffect(() => {
    const onStateChange = () => setYear(tool.year);
    tool.setOnStateChange(onStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool]);

  const handleYearChange = useCallback(
    (y: number) => {
      setYear(y);
      tool.setYear(y);
      const src = sources.find((s) => s.year === y);
      if (src) {
        const engine = getEngine();
        if (engine) {
          const tileSrc = sourceRegistry.get(src.id);
          if (tileSrc) engine.setTileSource(tileSrc);
        }
      }
    },
    [tool, sources],
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        width: 420,
        maxWidth: '95vw',
        background: 'rgba(10,10,20,0.9)',
        backdropFilter: 'blur(16px)',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '14px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
        ⏳ 时空穿梭
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="range"
          min={2015}
          max={2024}
          step={1}
          value={year}
          onChange={(e) => handleYearChange(Number(e.target.value))}
          style={{ flex: 1, height: 6, accentColor: '#ce93d8', cursor: 'pointer' }}
        />
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: '#ce93d8',
            minWidth: 48,
            textAlign: 'right',
          }}
        >
          {year}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {sources.map((s) => (
          <button
            key={s.id}
            onClick={() => handleYearChange(s.year)}
            style={{
              border: 'none',
              borderRadius: 6,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              background: year === s.year ? 'rgba(206,147,216,0.25)' : 'rgba(255,255,255,0.05)',
              color: year === s.year ? '#ce93d8' : 'rgba(255,255,255,0.5)',
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div
        style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.3)',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: 6,
        }}
      >
        💡 对比不同年代的卫星影像（需各图源覆盖同一区域）
      </div>
    </div>
  );
}
