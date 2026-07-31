// components/panels/PlaceSummaryPanel.tsx — 智能地点摘要面板 v0.5

import { useState, useEffect } from 'react';
import type { PlaceSummaryTool, PlaceSummaryResult } from '@tools/place-summary.tool';
import type { NearbyPOI } from '@core/geocode';

interface Props {
  tool: PlaceSummaryTool;
}

/** POI 类别 → 中文标签 + 颜色映射 */
const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  amenity: { label: '设施', color: '#42A5F5' },
  transport: { label: '交通', color: '#FFA726' },
  leisure: { label: '休闲', color: '#66BB6A' },
  shop: { label: '购物', color: '#AB47BC' },
  education: { label: '教育', color: '#26C6DA' },
  health: { label: '医疗', color: '#EF5350' },
  tourism: { label: '旅游', color: '#FF7043' },
  other: { label: '其他', color: '#78909C' },
};

export function PlaceSummaryPanel({ tool }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlaceSummaryResult | null>(null);

  useEffect(() => {
    tool.onLoading((l) => setLoading(l));
    tool.onResult((r) => setResult(r));

    return () => {
      tool.onLoading(null);
      tool.onResult(null);
    };
  }, [tool]);

  // 如果没有结果且不在加载中，不渲染面板
  if (!loading && !result) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        minWidth: 380,
        maxWidth: 440,
        maxHeight: 'calc(100vh - 200px)',
        background: 'rgba(10,10,20,0.92)',
        backdropFilter: 'blur(16px)',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        overflow: 'hidden',
      }}
    >
      {/* 标题行 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          📍 智能地点摘要
        </span>
        <span
          style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}
        >
          点击地图查询
        </span>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '16px 0',
          }}
        >
          <Spinner />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            加载中...
          </span>
        </div>
      )}

      {/* 结果 */}
      {result && !loading && (
        <>
          {/* 地点名称 */}
          <div
            style={{
              padding: '8px 10px',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 6,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.9)',
                lineHeight: 1.5,
              }}
            >
              {result.place.displayName || '未知地点'}
            </span>
            {result.place.category && (
              <span
                style={{
                  display: 'inline-block',
                  marginLeft: 8,
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'rgba(66,165,245,0.15)',
                  color: '#42A5F5',
                  verticalAlign: 'middle',
                }}
              >
                {result.place.category}
              </span>
            )}
          </div>

          {/* 自然语言摘要 */}
          <div
            style={{
              maxHeight: 160,
              overflowY: 'auto',
              fontSize: 11,
              lineHeight: 1.65,
              color: 'rgba(255,255,255,0.7)',
              whiteSpace: 'pre-wrap',
              padding: '4px 0',
            }}
          >
            {result.summary}
          </div>

          {/* POI 列表 */}
          {result.pois.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.35)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                周边兴趣点 ({result.pois.length})
              </div>

              <div
                style={{
                  maxHeight: 140,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {result.pois.map((poi, i) => (
                  <POIRow key={`${poi.name}-${i}`} poi={poi} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** 加载旋转指示器 */
function Spinner() {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        border: '2px solid rgba(255,255,255,0.1)',
        borderTopColor: 'rgba(255,255,255,0.45)',
        borderRadius: '50%',
        animation: 'palm-spin 0.7s linear infinite',
      }}
    />
  );
}

/** 单个 POI 行 */
function POIRow({ poi }: { poi: NearbyPOI }) {
  const meta = CATEGORY_LABELS[poi.type] ?? CATEGORY_LABELS.other;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.03)',
        fontSize: 11,
      }}
    >
      {/* 类别徽标 */}
      <span
        style={{
          display: 'inline-block',
          minWidth: 36,
          textAlign: 'center',
          fontSize: 10,
          fontWeight: 600,
          padding: '1px 6px',
          borderRadius: 4,
          background: `${meta.color}22`,
          color: meta.color,
          flexShrink: 0,
        }}
      >
        {meta.label}
      </span>

      {/* POI 名称 */}
      <span
        style={{
          flex: 1,
          color: 'rgba(255,255,255,0.75)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {poi.name}
      </span>

      {/* 距离 */}
      <span
        style={{
          flexShrink: 0,
          fontSize: 10,
          color: 'rgba(255,255,255,0.35)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {poi.distance >= 1000
          ? `${(poi.distance / 1000).toFixed(1)}km`
          : `${Math.round(poi.distance)}m`}
      </span>
    </div>
  );
}
