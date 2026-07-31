// components/terrain/HeatmapLayer.tsx — 热力图图层
//
// 数据源：地图点击采点 / CSV 导入
// 渲染：MapLibre 原生 heatmap layer
// 交互：半径/强度/透明度滑块实时调参

import { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { HeatmapTool, HeatPoint } from '../../tools/heatmap.tool';

const SOURCE_ID = 'palm-heatmap-src';
const LAYER_ID = 'palm-heatmap-layer';

interface HeatmapLayerProps {
  tool: HeatmapTool;
}

export function HeatmapLayer({ tool }: HeatmapLayerProps) {
  const [points, setPoints] = useState<HeatPoint[]>([]);
  const [radius, setRadius] = useState(30);
  const [intensity, setIntensity] = useState(0.4);
  const [opacity, setOpacity] = useState(0.7);
  const [clickMode, setClickMode] = useState(true);

  const mapRef = useRef<maplibregl.Map | null>(null);

  // ---- 同步 tool ----
  useEffect(() => {
    const onStateChange = () => {
      setPoints([...tool.points]);
    };
    tool.setOnStateChange(onStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool]);

  // ---- 初始化 ----
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map;
    mapRef.current = map;

    // 点击采点
    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (!clickMode) return;
      const pt: HeatPoint = {
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        weight: 50,
      };
      tool.addPoint(pt);
    };

    map.on('click', onClick);

    return () => {
      map.off('click', onClick);
      removeLayer(map);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 更新热力图 ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    updateHeatmap(map, points, radius, intensity, opacity);
  }, [points, radius, intensity, opacity]);

  // ---- CSV 导入 ----
  const handleCsvImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const lines = text.split('\n').filter((l) => l.trim());
        const newPoints: HeatPoint[] = [];
        for (let i = 1; i < lines.length; i++) {
          // 尝试跳过标题行
          const cols = lines[i].split(',');
          const lng = parseFloat(cols[0]);
          const lat = parseFloat(cols[1]);
          if (isNaN(lng) || isNaN(lat)) continue; // 可能标题行
          const weight = cols.length > 2 ? parseFloat(cols[2]) : 50;
          if (lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
            newPoints.push({
              lng,
              lat,
              weight: isNaN(weight) ? 50 : Math.max(1, Math.min(100, weight)),
            });
          }
        }
        if (newPoints.length > 0) {
          tool.addPoints(newPoints);
          setPoints([...tool.points]);
        }
      };
      reader.readAsText(file);
      e.target.value = ''; // 允许重复导入同一文件
    },
    [tool],
  );

  // ---- 清除 ----
  const handleClear = useCallback(() => {
    tool.clearPoints();
    setPoints([]);
  }, [tool]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        width: 400,
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
      {/* 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
          🔥 热力图
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          {points.length} 个数据点
        </span>
      </div>

      {/* 操作按钮栏 */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          onClick={() => setClickMode(!clickMode)}
          style={{
            border: 'none',
            borderRadius: 6,
            padding: '5px 12px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            background: clickMode ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
            color: clickMode ? '#fff' : 'rgba(255,255,255,0.5)',
            transition: 'all 0.15s',
          }}
        >
          🖱 点击采点
        </button>

        <label
          style={{
            border: 'none',
            borderRadius: 6,
            padding: '5px 12px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          📂 导入CSV
          <input type="file" accept=".csv" onChange={handleCsvImport} style={{ display: 'none' }} />
        </label>

        {points.length > 0 && (
          <button
            onClick={handleClear}
            style={{
              border: 'none',
              borderRadius: 6,
              padding: '5px 12px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(239,83,80,0.2)',
              color: '#ef5350',
              marginLeft: 'auto',
            }}
          >
            ✕ 清除
          </button>
        )}
      </div>

      {/* 参数滑条（有数据时显示） */}
      {points.length > 0 && (
        <>
          {/* 半径 */}
          <SliderRow
            label="半径"
            value={radius}
            min={5}
            max={100}
            onChange={(v) => setRadius(v)}
            unit="px"
            color="#ff7043"
          />
          {/* 强度 */}
          <SliderRow
            label="强度"
            value={intensity}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(v) => setIntensity(v)}
            color="#ffca28"
          />
          {/* 透明度 */}
          <SliderRow
            label="透明度"
            value={opacity}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(v) => setOpacity(v)}
            color="#42a5f5"
          />

          {/* 图例 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              color: 'rgba(255,255,255,0.3)',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              paddingTop: 6,
            }}
          >
            <span>低密度</span>
            <span
              style={{
                width: 16,
                height: 10,
                borderRadius: 2,
                background: 'linear-gradient(90deg, #0000ff, #00ff00, #ffff00, #ff0000)',
              }}
            />
            <span>高密度</span>
            <span style={{ marginLeft: 'auto' }}>💡 CSV格式: lng,lat[,weight]</span>
          </div>
        </>
      )}

      {points.length === 0 && (
        <div
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.4)',
            textAlign: 'center',
            padding: '8px 0',
          }}
        >
          🖱 点击地图添加数据点，或 📂 导入 CSV 文件
        </div>
      )}
    </div>
  );
}

// ---- 辅助组件 ----

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit,
  color,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', minWidth: 48 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, height: 5, accentColor: color, cursor: 'pointer' }}
      />
      <span
        style={{ fontSize: 12, color: '#fff', fontWeight: 600, minWidth: 52, textAlign: 'right' }}
      >
        {typeof value === 'number' && step < 1 ? value.toFixed(2) : value}
        {unit ?? ''}
      </span>
    </div>
  );
}

// ---- MapLibre Heatmap ----

function updateHeatmap(
  map: maplibregl.Map,
  points: HeatPoint[],
  radius: number,
  intensity: number,
  opacity: number,
): void {
  const fc: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      properties: { weight: p.weight },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  };

  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(fc);
  } else {
    map.addSource(SOURCE_ID, { type: 'geojson', data: fc });

    map.addLayer({
      id: LAYER_ID,
      type: 'heatmap',
      source: SOURCE_ID,
      paint: {
        'heatmap-radius': radius,
        'heatmap-weight': ['get', 'weight'],
        'heatmap-intensity': intensity,
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(33,102,172,0)',
          0.2,
          'rgb(103,169,207)',
          0.4,
          'rgb(209,229,240)',
          0.6,
          'rgb(253,219,199)',
          0.8,
          'rgb(239,138,98)',
          1,
          'rgb(178,24,43)',
        ],
        'heatmap-opacity': opacity,
      },
    });
    return;
  }

  // 更新 paint（已存在的 layer 直接设，避免 removeLayer 闪烁）
  map.setPaintProperty(LAYER_ID, 'heatmap-radius', radius);
  map.setPaintProperty(LAYER_ID, 'heatmap-intensity', intensity);
  map.setPaintProperty(LAYER_ID, 'heatmap-opacity', opacity);
}

function removeLayer(map: maplibregl.Map): void {
  try {
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
  } catch {
    /* */
  }
  try {
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  } catch {
    /* */
  }
}
