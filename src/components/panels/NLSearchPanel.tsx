// components/panels/NLSearchPanel.tsx — 自然语言搜索面板
// 底部左侧浮层：输入框 + 结果列表，点击结果飞向地图并打点

import { useState, useRef, useCallback, useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';
import { Search, X, Loader2, MapPin, Navigation } from 'lucide-react';
import { getEngine } from '../../hooks/useMap';
import type { NLSearchTool, NLSearchResult } from '../../tools/nl-search.tool';

interface Props {
  tool: NLSearchTool;
}

export function NLSearchPanel({ tool }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NLSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ msg: '', pct: 0 });
  const [error, setError] = useState<string | null>(null);
  const resultMarkersRef = useRef<maplibregl.Marker[]>([]);

  // 注册回调
  useEffect(() => {
    tool.onResult = (items) => {
      setResults(items);
      setLoading(false);
      if (items.length === 0) {
        setError('未找到匹配结果，请尝试其他关键词');
      }
    };
    tool.onProgress = (msg, pct) => {
      setProgress({ msg, pct });
    };
    return () => {
      tool.onResult = null;
      tool.onProgress = null;
    };
  }, [tool]);

  // 清理旧 markers
  const clearMarkers = useCallback(() => {
    resultMarkersRef.current.forEach((m) => m.remove());
    resultMarkersRef.current = [];
  }, []);

  // 组件卸载时清理
  useEffect(() => clearMarkers, [clearMarkers]);

  // 提交搜索
  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    clearMarkers();
    setResults([]);
    setError(null);
    setLoading(true);
    setProgress({ msg: '正在分析查询意图…', pct: 5 });

    await tool.search(trimmed);
  }, [query, loading, tool, clearMarkers]);

  // 点击结果：飞向目标 + 加标记
  const handleResultClick = useCallback(
    (result: NLSearchResult) => {
      const engine = getEngine();
      if (!engine) return;

      // 清理旧标记
      clearMarkers();

      // 飞行
      engine.flyTo(result.lngLat, 15);

      // 添加标记
      const map = engine.getNative() as maplibregl.Map | null;
      if (map) {
        const marker = new maplibregl.Marker({ color: '#f59e0b' })
          .setLngLat(result.lngLat)
          .setPopup(
            new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(
              `<div style="font-size:12px;max-width:200px;word-break:break-all;line-height:1.4">
                <strong>${escapeHtml(result.displayName)}</strong>
                ${result.distance != null ? `<br/><span style="color:#888">距离 ${formatDistance(result.distance)}</span>` : ''}
              </div>`,
            ),
          )
          .addTo(map);
        marker.togglePopup();
        resultMarkersRef.current.push(marker);
      }
    },
    [clearMarkers],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div style={containerStyle}>
      {/* 标题栏 */}
      <div style={headerStyle}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>💬 自然语言搜索</span>
      </div>

      {/* 输入区 */}
      <div style={inputRowStyle}>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder='例如：故宫附近有哪些公园、台北最高的山'
          style={inputStyle}
          disabled={loading}
          aria-label="自然语言搜索输入"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          style={searchBtnStyle(loading, !query.trim())}
          aria-label="搜索"
        >
          {loading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={15} />}
        </button>
      </div>

      {/* 进度 */}
      {loading && (
        <div style={progressStyle}>
          <div style={progressBarOuter}>
            <div style={{ ...progressBarInner, width: `${progress.pct}%` }} />
          </div>
          <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{progress.msg}</span>
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div style={errorStyle}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} style={xBtnStyle} aria-label="关闭">
            <X size={13} />
          </button>
        </div>
      )}

      {/* 结果列表 */}
      {results.length > 0 && (
        <div style={resultsContainerStyle}>
          <div style={resultsHeaderStyle}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>共 {results.length} 个结果</span>
            <button
              type="button"
              onClick={() => {
                clearMarkers();
                setResults([]);
                setQuery('');
              }}
              style={clearBtnStyle}
            >
              清除
            </button>
          </div>
          <div style={resultsListStyle}>
            {results.map((r, i) => (
              <button
                key={`${r.displayName}-${i}`}
                type="button"
                onClick={() => handleResultClick(r)}
                style={resultItemStyle}
              >
                <MapPin size={14} style={{ flexShrink: 0, color: '#f59e0b', marginTop: 2 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.4, wordBreak: 'break-all' }}>
                    {r.displayName}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                    {r.category}/{r.type}
                    {r.distance != null ? ` · ${formatDistance(r.distance)}` : ''}
                  </div>
                </div>
                <Navigation size={13} style={{ flexShrink: 0, color: '#475569', marginLeft: 'auto' }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- 内联样式 ----

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 36,
  left: 280,
  width: 340,
  maxHeight: 420,
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'rgba(15, 23, 42, 0.92)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: 10,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
  overflow: 'hidden',
  zIndex: 100,
};

const headerStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  padding: '10px 14px',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: 34,
  padding: '0 10px',
  fontSize: 13,
  color: '#e2e8f0',
  backgroundColor: 'rgba(255, 255, 255, 0.07)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  borderRadius: 6,
  outline: 'none',
};

const searchBtnStyle = (loading: boolean, disabled: boolean): React.CSSProperties => ({
  width: 34,
  height: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: loading || disabled ? 'rgba(255,255,255,0.06)' : '#f59e0b',
  color: loading || disabled ? '#64748b' : '#0f172a',
  border: 'none',
  borderRadius: 6,
  cursor: loading || disabled ? 'default' : 'pointer',
  opacity: disabled && !loading ? 0.5 : 1,
});

const progressStyle: React.CSSProperties = {
  padding: '0 14px 8px',
};

const progressBarOuter: React.CSSProperties = {
  height: 3,
  backgroundColor: 'rgba(255,255,255,0.1)',
  borderRadius: 2,
  overflow: 'hidden',
};

const progressBarInner: React.CSSProperties = {
  height: '100%',
  backgroundColor: '#f59e0b',
  borderRadius: 2,
  transition: 'width 0.3s ease',
};

const errorStyle: React.CSSProperties = {
  margin: '0 14px 8px',
  padding: '6px 10px',
  fontSize: 12,
  color: '#fca5a5',
  backgroundColor: 'rgba(239, 68, 68, 0.12)',
  border: '1px solid rgba(239, 68, 68, 0.25)',
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const xBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#fca5a5',
  cursor: 'pointer',
  padding: 2,
};

const resultsContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
};

const resultsHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 14px 4px',
};

const clearBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#64748b',
  fontSize: 11,
  cursor: 'pointer',
  padding: 0,
};

const resultsListStyle: React.CSSProperties = {
  overflowY: 'auto',
  maxHeight: 260,
  padding: '4px 8px 8px',
};

const resultItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  width: '100%',
  padding: '8px 10px',
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background-color 0.15s',
};

// ---- 辅助函数 ----

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
