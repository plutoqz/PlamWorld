// components/visual/ColorRampPicker.tsx — 色阶选择器
// 可视化预览每个 ColorBrewer / 内建色阶方案

import type { ColorScheme, ColorSchemeType } from '@core/choropleth';
import { COLOR_SCHEMES } from '@core/choropleth';

interface ColorRampPickerProps {
  value: string;
  onChange: (id: string) => void;
  /** 当前分类的段数，>=3 的色阶可能需要调整 */
  k?: number;
}

export function ColorRampPicker({ value, onChange, k = 5 }: ColorRampPickerProps) {
  const types: { type: ColorSchemeType; label: string }[] = [
    { type: 'sequential', label: '单色序' },
    { type: 'multi-hue', label: '多色序' },
    { type: 'diverging', label: '发散' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {types.map(({ type, label }) => {
        const schemes = COLOR_SCHEMES.filter((s) => s.type === type);
        if (schemes.length === 0) return null;
        return (
          <div key={type}>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.35)',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              {label}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {schemes.map((s) => (
                <RampItem
                  key={s.id}
                  scheme={s}
                  selected={value === s.id}
                  k={k}
                  onClick={() => onChange(s.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function sampleColors(scheme: ColorScheme, k: number): string[] {
  const n = Math.min(k, scheme.colors.length);
  const step = (scheme.colors.length - 1) / Math.max(n - 1, 1);
  const result: string[] = [];
  for (let i = 0; i < n; i++) {
    result.push(scheme.colors[Math.round(i * step)]);
  }
  return result;
}

function RampItem({
  scheme,
  selected,
  k,
  onClick,
}: {
  scheme: ColorScheme;
  selected: boolean;
  k: number;
  onClick: () => void;
}) {
  const colors = sampleColors(scheme, k);
  return (
    <button
      onClick={onClick}
      title={scheme.name}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: 4,
        border: selected ? '2px solid #00e5ff' : '2px solid transparent',
        borderRadius: 6,
        background: selected ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.03)',
        cursor: 'pointer',
        width: 56,
      }}
    >
      <div
        style={{
          height: 16,
          borderRadius: 2,
          background: `linear-gradient(90deg, ${colors.join(', ')})`,
        }}
      />
      <span
        style={{
          fontSize: 9,
          color: selected ? '#00e5ff' : 'rgba(255,255,255,0.5)',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {scheme.name}
      </span>
    </button>
  );
}
