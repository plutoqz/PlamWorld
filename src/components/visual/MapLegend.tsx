// components/visual/MapLegend.tsx — Choropleth 地图图例组件
// 自动根据分类断点 + 色阶生成渐变条 + 标签

import { useMemo } from 'react';
import type { ClassifyMethod } from '@core/choropleth';
import { pickColors, findColorScheme } from '@core/choropleth';

interface MapLegendProps {
  breaks: number[];
  range: [number, number];
  colorSchemeId: string;
  method: ClassifyMethod;
  /** 数值格式化 */
  valueFormat?: (v: number) => string;
}

export function MapLegend({
  breaks,
  range,
  colorSchemeId,
  method,
  valueFormat = defaultFormat,
}: MapLegendProps) {
  const scheme = findColorScheme(colorSchemeId);
  const colors = useMemo(() => {
    if (!scheme) return ['#ccc', '#999'];
    return pickColors(scheme, method === 'continuous' ? 9 : breaks.length + 1);
  }, [scheme, breaks.length, method]);

  if (!scheme) return null;

  const allValues =
    method === 'continuous'
      ? [range[0], range[0] + (range[1] - range[0]) / 2, range[1]]
      : [range[0], ...breaks, range[1]];

  return (
    <div className="pw-map-legend">
      <strong>图例</strong>

      {/* 色阶条 */}
      <div className="pw-map-legend-bar" style={{ background: `linear-gradient(90deg, ${colors.join(', ')})` }} />

      {/* 标签 */}
      <div className="pw-map-legend-labels">
        {allValues.map((v, i) => (
          <span key={i} style={{ textAlign: i === 0 ? 'left' : i === allValues.length - 1 ? 'right' : 'center' }}>
            {valueFormat(v)}
          </span>
        ))}
      </div>

      <small>
        {method === 'jenks' ? 'Jenks 自然断点' : method === 'quantile' ? '分位数' : method === 'equal' ? '等间隔' : '连续渐变色'}
      </small>
    </div>
  );
}

function defaultFormat(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(1);
}
