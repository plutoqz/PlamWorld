// components/visual/DataPreview.tsx — CSV/JSON 数据预览 + 列选择器
//
// 职责：
//   - 展示上传数据的前 N 行
//   - 列选择下拉：区域名列 / 数值列 / 分组列（可选）
//   - 显示匹配报告概要

import type { ParsedData, ClassifyMethod } from '@core/choropleth';

interface DataPreviewProps {
  data: ParsedData | null;
  regionNameCol: string | null;
  valueCol: string | null;
  groupCol: string | null;
  method: ClassifyMethod;
  k: number;
  onRegionNameColChange: (col: string | null) => void;
  onValueColChange: (col: string | null) => void;
  onGroupColChange: (col: string | null) => void;
  onMethodChange: (method: ClassifyMethod) => void;
  onKChange: (k: number) => void;
  matchedCount?: number;
  totalCount?: number;
}

export function DataPreview({
  data,
  regionNameCol,
  valueCol,
  groupCol,
  method,
  k,
  onRegionNameColChange,
  onValueColChange,
  onGroupColChange,
  onMethodChange,
  onKChange,
  matchedCount,
  totalCount,
}: DataPreviewProps) {
  if (!data) {
    return (
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 16 }}>
        尚未加载数据
      </div>
    );
  }

  const previewRows = data.rows.slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 列选择器 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ColSelect label="区域名列" value={regionNameCol} columns={data.columns} onChange={onRegionNameColChange} />
        <ColSelect label="数值列" value={valueCol} columns={data.columns} onChange={onValueColChange} />
        <ColSelect label="分组列(可选)" value={groupCol} columns={['(无)', ...data.columns]} onChange={onGroupColChange} />
      </div>

      {/* 分类方法 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>分类:</span>
        <MethodSelect value={method} onChange={onMethodChange} />
        {method !== 'continuous' && (
          <>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>段数:</span>
            <select
              value={k}
              onChange={(e) => onKChange(Number(e.target.value))}
              style={selectStyle}
            >
              {[3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* 匹配报告 */}
      {totalCount !== undefined && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          区域匹配: {matchedCount ?? '?'} / {totalCount}
          {matchedCount !== undefined && matchedCount < totalCount && (
            <span style={{ color: '#ff7043', marginLeft: 6 }}>
              ({totalCount - matchedCount} 个未匹配)
            </span>
          )}
        </div>
      )}

      {/* 数据预览表格 */}
      <div style={{ overflow: 'auto', maxHeight: 160, borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
              <th style={thStyle}>#</th>
              {data.columns.map((col) => (
                <th
                  key={col}
                  style={{
                    ...thStyle,
                    color:
                      col === regionNameCol
                        ? '#4fc3f7'
                        : col === valueCol
                          ? '#ffab40'
                          : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i}>
                <td style={tdStyle}>{i + 1}</td>
                {data.columns.map((col) => (
                  <td key={col} style={tdStyle}>
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length > 5 && (
          <div style={{ padding: '4px 8px', fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
            ... 共 {data.rows.length} 行
          </div>
        )}
      </div>
    </div>
  );
}

// ---- sub-components ----

function ColSelect({
  label,
  value,
  columns,
  onChange,
}: {
  label: string;
  value: string | null;
  columns: string[];
  onChange: (col: string | null) => void;
}) {
  // filter out the "(无)" sentinel for display, but keep value selection working
  const displayCols = columns.filter((c) => c !== '(无)');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      <select
        value={value ?? '(无)'}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '(无)' ? null : v);
        }}
        style={selectStyle}
      >
        <option value="(无)">(无)</option>
        {displayCols.map((col) => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>
    </div>
  );
}

function MethodSelect({
  value,
  onChange,
}: {
  value: ClassifyMethod;
  onChange: (m: ClassifyMethod) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as ClassifyMethod)} style={selectStyle}>
      <option value="jenks">Jenks 自然断点</option>
      <option value="quantile">分位数</option>
      <option value="equal">等间隔</option>
      <option value="continuous">连续渐变色</option>
    </select>
  );
}

// ---- styles ----

const selectStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.85)',
  borderRadius: 4,
  padding: '2px 6px',
  fontSize: 11,
  fontFamily: 'inherit',
};

const thStyle: React.CSSProperties = {
  padding: '4px 8px',
  textAlign: 'left',
  fontSize: 10,
  color: 'rgba(255,255,255,0.5)',
  fontWeight: 600,
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderBottom: '1px solid rgba(255,255,255,0.03)',
  color: 'rgba(255,255,255,0.7)',
  whiteSpace: 'nowrap',
};
