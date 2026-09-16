// components/panels/TimeTravelPanel.tsx — 时空穿梭面板
// 对接官方 ESRI World Imagery Wayback 历史遥感档案 (2014 - 2026)

import { useState, useEffect, useCallback } from 'react';
import { Play, Pause, Eye, Calendar, Sparkles } from 'lucide-react';
import type { TimeTravelTool } from '../../tools/time-travel.tool';

interface Props {
  tool: TimeTravelTool;
}

export function TimeTravelPanel({ tool }: Props) {
  const [year, setYear] = useState(tool.year);
  const [opacity, setOpacity] = useState(tool.opacity);
  const [isPlaying, setIsPlaying] = useState(tool.isPlaying);

  useEffect(() => {
    const onStateChange = () => {
      setYear(tool.year);
      setOpacity(tool.opacity);
      setIsPlaying(tool.isPlaying);
    };
    tool.setOnStateChange(onStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool]);

  const handleYearChange = useCallback(
    (y: number) => {
      setYear(y);
      tool.setYear(y);
    },
    [tool],
  );

  const handleOpacityChange = useCallback(
    (op: number) => {
      setOpacity(op);
      tool.setOpacity(op);
    },
    [tool],
  );

  const togglePlay = useCallback(() => {
    const next = !isPlaying;
    setIsPlaying(next);
    tool.setPlaying(next);
  }, [isPlaying, tool]);

  const currentRelease = tool.currentRelease;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        width: 480,
        maxWidth: '95vw',
        background: 'rgba(13, 18, 23, 0.92)',
        backdropFilter: 'blur(16px)',
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* 头部标题与自动播放按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 15 }}>⏳</span>
          <strong style={{ fontSize: 13, color: 'var(--pw-text)' }}>
            时空穿梭 · ESRI Wayback 历史遥感
          </strong>
          <span
            style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(168, 85, 247, 0.2)',
              color: '#c084fc',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <Sparkles size={10} />
            2014 - 2026
          </span>
        </div>

        <button
          type="button"
          onClick={togglePlay}
          className="pw-secondary-button"
          style={{
            fontSize: 11,
            padding: '4px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: isPlaying ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
            color: isPlaying ? '#f87171' : '#60a5fa',
            borderColor: isPlaying ? '#ef4444' : '#3b82f6',
          }}
        >
          {isPlaying ? (
            <>
              <Pause size={12} />
              <span>暂停演进</span>
            </>
          ) : (
            <>
              <Play size={12} />
              <span>自动演进</span>
            </>
          )}
        </button>
      </div>

      {/* 年份主滑块与年份数值 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--pw-text-muted)' }}>
            <Calendar size={13} />
            <span>测绘年代</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#c084fc', letterSpacing: -0.5 }}>
              {year}
            </span>
            <span style={{ fontSize: 11, color: 'var(--pw-text-muted)' }}>
              ({currentRelease.date})
            </span>
          </div>
        </div>

        <input
          type="range"
          min={2014}
          max={2026}
          step={1}
          value={year}
          onChange={(e) => handleYearChange(Number(e.target.value))}
          style={{ width: '100%', height: 6, accentColor: '#c084fc', cursor: 'pointer' }}
        />
      </div>

      {/* 快捷跳转标签 */}
      <div style={{ display: 'flex', gap: 5, justifyContent: 'space-between' }}>
        {[2014, 2017, 2020, 2023, 2026].map((y) => {
          const isCurr = year === y;
          return (
            <button
              key={y}
              type="button"
              onClick={() => handleYearChange(y)}
              style={{
                flex: 1,
                border: 'none',
                borderRadius: 5,
                padding: '4px 0',
                fontSize: 11,
                fontWeight: isCurr ? 700 : 500,
                cursor: 'pointer',
                background: isCurr ? '#c084fc' : 'rgba(255, 255, 255, 0.05)',
                color: isCurr ? '#0d1217' : 'var(--pw-text-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              {y}
              {y === 2026 ? ' (最新)' : ''}
            </button>
          );
        })}
      </div>

      {/* 透明度滑块（图层渐变对比） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
        <Eye size={13} style={{ color: 'var(--pw-text-muted)' }} />
        <span style={{ fontSize: 11, color: 'var(--pw-text-muted)', whiteSpace: 'nowrap' }}>
          影像透明度
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => handleOpacityChange(Number(e.target.value))}
          style={{ flex: 1, height: 4, accentColor: '#60a5fa', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 11, color: 'var(--pw-text-muted)', minWidth: 32, textAlign: 'right' }}>
          {Math.round(opacity * 100)}%
        </span>
      </div>

      {/* 底部备注 */}
      <div
        style={{
          fontSize: 10,
          color: 'var(--pw-text-faint)',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          paddingTop: 6,
          lineHeight: 1.4,
        }}
      >
        🛰️ 真实对接 ESRI World Imagery Wayback 全球历史遥感归档，支持无缝观察城市扩张、湖泊水系及生态环境变迁。
      </div>
    </div>
  );
}

