// components/panels/LayerImportPanel.tsx — 自定义图层导入面板
//
// 支持：拖拽文件到地图 / 点击选择 / GeoJSON / GPX / KML

import { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { gpx, kml } from '@tmcw/togeojson';
import type { FeatureCollection } from 'geojson';
import type { LayerImportTool, ImportedLayer } from '../../tools/layer-import.tool';

const COLORS = ['#4fc3f7', '#ffb74d', '#81c784', '#ef5350', '#ce93d8', '#fff176', '#4db6ac'];

interface Props {
  tool: LayerImportTool;
}

export function LayerImportPanel({ tool }: Props) {
  const [layers, setLayers] = useState<ImportedLayer[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layerSources = useRef<Map<string, string>>(new Map());

  // 同步
  useEffect(() => {
    const onStateChange = () => setLayers([...tool.layers]);
    tool.setOnStateChange(onStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool]);

  // 初始化引擎
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    mapRef.current = engine.getNative() as maplibregl.Map;
  }, [tool]);

  // 渲染/更新图层
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layers.forEach((l) => renderImportedLayer(map, l, layerSources.current));
    // 移除已删除的
    const activeIds = new Set(layers.map((l) => l.id));
    layerSources.current.forEach((_, id) => {
      if (!activeIds.has(id)) removeLayerSource(map, id);
    });
  }, [layers]);

  // 文件处理
  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !['geojson', 'json', 'gpx', 'kml'].includes(ext)) return;

      const text = await file.text();
      let fc: FeatureCollection;

      try {
        if (ext === 'gpx') {
          const doc = new DOMParser().parseFromString(text, 'text/xml');
          fc = gpx(doc) as FeatureCollection;
        } else if (ext === 'kml') {
          const doc = new DOMParser().parseFromString(text, 'text/xml');
          fc = kml(doc) as FeatureCollection;
        } else {
          fc = JSON.parse(text) as FeatureCollection;
        }
      } catch {
        alert(`无法解析文件: ${file.name}`);
        return;
      }

      if (!fc.features || fc.features.length === 0) {
        alert(`文件没有有效的地理数据: ${file.name}`);
        return;
      }

      const color = COLORS[tool.layers.length % COLORS.length];
      tool.addLayer(file.name, fc, color);

      // 飞到数据范围
      const map = mapRef.current;
      if (map && fc.features.length > 0) {
        try {
          const bounds = computeBounds(fc);
          if (bounds)
            map.flyTo({ center: bounds.center, zoom: Math.min(bounds.zoom, 14), duration: 1200 });
        } catch {
          /* 忽略 */
        }
      }
    },
    [tool],
  );

  // 拖拽事件
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      Array.from(e.dataTransfer.files).forEach(handleFile);
    },
    [handleFile],
  );

  // 文件选择器
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) Array.from(files).forEach(handleFile);
      e.target.value = '';
    },
    [handleFile],
  );

  // 图层操作
  const handleRemove = useCallback(
    (id: string) => {
      const map = mapRef.current;
      if (map) removeLayerSource(map, id);
      tool.removeLayer(id);
    },
    [tool],
  );

  const handleToggle = useCallback(
    (id: string) => {
      tool.toggleLayer(id);
      const map = mapRef.current;
      const layer = tool.layers.find((l) => l.id === id);
      if (map && layer) {
        map.setLayoutProperty(`${id}-fill`, 'visibility', layer.visible ? 'visible' : 'none');
        map.setLayoutProperty(`${id}-line`, 'visibility', layer.visible ? 'visible' : 'none');
      }
    },
    [tool],
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        width: 380,
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
        📂 图层导入
      </div>

      {/* 拖拽区域 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? '#4fc3f7' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 10,
          padding: '18px 12px',
          textAlign: 'center',
          background: dragOver ? 'rgba(79,195,247,0.08)' : 'rgba(255,255,255,0.03)',
          transition: 'all 0.2s',
          cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 4 }}>📥</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>拖拽文件到这里</div>

        <label
          style={{
            display: 'inline-block',
            marginTop: 8,
            padding: '4px 14px',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.6)',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          选择文件
          <input
            type="file"
            accept=".geojson,.json,.gpx,.kml"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </label>

        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
          支持 GeoJSON · GPX · KML
        </div>
      </div>

      {/* 图层列表 */}
      {layers.length > 0 && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            maxHeight: 180,
            overflow: 'auto',
          }}
        >
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>
            {layers.length} 个图层
          </div>
          {layers.map((l) => (
            <div
              key={l.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: l.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.7)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {l.name}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>
                {l.data.features.length} 要素
              </span>
              <button
                onClick={() => handleToggle(l.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: l.visible ? '#81c784' : 'rgba(255,255,255,0.3)',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                {l.visible ? '👁' : '—'}
              </button>
              <button
                onClick={() => handleRemove(l.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef5350',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- 渲染 ----

function renderImportedLayer(
  map: maplibregl.Map,
  layer: ImportedLayer,
  sources: Map<string, string>,
): void {
  const srcId = `${layer.id}-src`;
  const fillId = `${layer.id}-fill`;
  const lineId = `${layer.id}-line`;

  // 已存在 → 更新数据 + 可见性
  if (map.getSource(srcId)) {
    (map.getSource(srcId) as maplibregl.GeoJSONSource).setData(layer.data);
    map.setLayoutProperty(fillId, 'visibility', layer.visible ? 'visible' : 'none');
    map.setLayoutProperty(lineId, 'visibility', layer.visible ? 'visible' : 'none');
    return;
  }

  map.addSource(srcId, { type: 'geojson', data: layer.data });
  sources.set(layer.id, srcId);

  const hasPolygon = layer.data.features.some(
    (f) => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon',
  );

  if (hasPolygon) {
    map.addLayer({
      id: fillId,
      source: srcId,
      type: 'fill',
      paint: { 'fill-color': layer.color, 'fill-opacity': 0.25 },
      layout: { visibility: layer.visible ? 'visible' : 'none' },
    });
  }
  map.addLayer({
    id: lineId,
    source: srcId,
    type: 'line',
    paint: { 'line-color': layer.color, 'line-width': 2, 'line-opacity': 0.9 },
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
      visibility: layer.visible ? 'visible' : 'none',
    },
  });
}

function removeLayerSource(map: maplibregl.Map, id: string): void {
  try {
    if (map.getLayer(`${id}-fill`)) map.removeLayer(`${id}-fill`);
  } catch {
    /* */
  }
  try {
    if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`);
  } catch {
    /* */
  }
  try {
    if (map.getSource(`${id}-src`)) map.removeSource(`${id}-src`);
  } catch {
    /* */
  }
}

// ---- 计算 bounds ----
function computeBounds(fc: FeatureCollection): { center: [number, number]; zoom: number } | null {
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  const walk = (coords: any) => {
    for (const item of coords) {
      if (typeof item[0] === 'number') {
        minLng = Math.min(minLng, item[0]);
        maxLng = Math.max(maxLng, item[0]);
        minLat = Math.min(minLat, item[1]);
        maxLat = Math.max(maxLat, item[1]);
      } else walk(item);
    }
  };
  walk(fc.features.map((f: any) => f.geometry.coordinates));
  if (!isFinite(minLng)) return null;
  return { center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2], zoom: 10 };
}
