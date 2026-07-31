// components/panels/ImageAnalysisPanel.tsx — 卫星图色彩分析面板
//
// 展示截取视口后的像素分析结果：植被 / 水体 / 建筑 / 其他占比

import { useState, useCallback, useEffect } from 'react';
import type { ImageAnalysisTool, ImageAnalysisResult } from '../../tools/image-analysis.tool';

// 动态注入 keyframes，避免污染全局 CSS
const SPIN_KEYFRAMES_ID = 'pw-image-analysis-spin';
function ensureKeyframes() {
  if (document.getElementById(SPIN_KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = SPIN_KEYFRAMES_ID;
  style.textContent = '@keyframes pw-ia-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
  document.head.appendChild(style);
}

interface Props {
  tool: ImageAnalysisTool;
}

export function ImageAnalysisPanel({ tool }: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<ImageAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress('正在截取视口影像…');

    tool.setOnResult((data) => setResult(data));
    tool.setOnProgress((msg) => setProgress(msg));

    try {
      await tool.analyze();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '分析失败');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [tool]);

  useEffect(() => {
    ensureKeyframes();
  }, []);

  // ---- 渲染 ----

  const bars: { label: string; color: string; value: number; pct: string }[] = result
    ? [
        { label: '🌿 植被', color: '#4caf50', value: result.vegetation, pct: ((result.vegetation / result.totalPixels) * 100).toFixed(1) },
        { label: '💧 水体', color: '#2196f3', value: result.water,      pct: ((result.water      / result.totalPixels) * 100).toFixed(1) },
        { label: '🏗️ 建筑', color: '#9e9e9e', value: result.building,   pct: ((result.building   / result.totalPixels) * 100).toFixed(1) },
        { label: '📦 其他', color: '#e0e0e0', value: result.other,      pct: ((result.other      / result.totalPixels) * 100).toFixed(1) },
      ]
    : [];

  return (
    <div style={outerStyle}>
      {/* 标题 */}
      <div style={titleStyle}>
        <span>🛰️ 卫星图色彩分析</span>
      </div>

      {/* 分析按钮 */}
      <button
        disabled={loading}
        onClick={handleAnalyze}
        style={{
          ...btnStyle,
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? '⏳ 分析中…' : '📸 分析当前视口'}
      </button>

      {/* 加载 / 错误 / 结果 */}
      {loading && progress && (
        <div style={progressStyle}>
          <span style={spinnerTextStyle}>⟳</span>
          <span>{progress}</span>
        </div>
      )}

      {error && (
        <div style={errorStyle}>⚠️ {error}</div>
      )}

      {result && !loading && (
        <div style={resultWrap}>
          {/* 色条 */}
          {bars.map((bar) => (
            <div key={bar.label} style={barRowStyle}>
              <span style={barLabelStyle}>{bar.label}</span>
              <div style={barTrackStyle}>
                <div
                  style={{
                    ...barFillStyle,
                    width: `${bar.pct}%`,
                    backgroundColor: bar.color,
                  }}
                />
              </div>
              <span style={barPctStyle}>{bar.pct}%</span>
            </div>
          ))}

          {/* 总计 */}
          <div style={totalStyle}>
            📐 总像素：{(result.totalPixels ?? 0).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- inline styles ----

const outerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 36,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 2000,
  width: 380,
  maxWidth: '95vw',
  background: 'rgba(10,10,20,0.92)',
  backdropFilter: 'blur(16px)',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '14px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.85)',
};

const btnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 8,
  padding: '8px 0',
  fontSize: 13,
  fontWeight: 600,
  background: 'rgba(76,175,80,0.25)',
  color: '#81c784',
  transition: 'background 0.2s',
};

const progressStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 12,
  color: 'rgba(255,255,255,0.55)',
};

const spinnerTextStyle: React.CSSProperties = {
  fontSize: 16,
  color: '#81c784',
  display: 'inline-block',
  animation: 'pw-ia-spin 0.8s linear infinite',
};

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#ef5350',
  padding: '6px 10px',
  borderRadius: 6,
  background: 'rgba(239,83,80,0.1)',
};

const resultWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const barRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const barLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.7)',
  minWidth: 72,
};

const barTrackStyle: React.CSSProperties = {
  flex: 1,
  height: 10,
  borderRadius: 5,
  background: 'rgba(255,255,255,0.06)',
  overflow: 'hidden',
};

const barFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 5,
  transition: 'width 0.4s ease',
  minWidth: 2,
};

const barPctStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.55)',
  minWidth: 42,
  textAlign: 'right',
};

const totalStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'rgba(255,255,255,0.35)',
  borderTop: '1px solid rgba(255,255,255,0.06)',
  paddingTop: 6,
  marginTop: 2,
};
