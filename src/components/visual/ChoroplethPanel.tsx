// components/visual/ChoroplethPanel.tsx — 趣味地图生成主控制面板
//
// 数据流：
//   用户上传 CSV/JSON → papaparse 解析 → 列映射 → fuse.js 模糊匹配
//   → classify() 计算断点 → pickColors() 取色 → 渲染 MapLibre fill layer

import { useState, useCallback, useRef, useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';
import { FolderOpen, MapPinned, RotateCcw } from 'lucide-react';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import Papa from 'papaparse';
import type { ParsedData } from '@core/choropleth';
import { matchRegions, classify, pickColors, findColorScheme, colorForValue } from '@core/choropleth';
import { getCountries } from '@data/boundaries/index';
import type { ChoroplethTool } from '@tools/choropleth.tool';
import { DataPreview } from './DataPreview';
import { ColorRampPicker } from './ColorRampPicker';
import { MapLegend } from './MapLegend';

const CHOROPLETH_SOURCE = 'choropleth-fill-source';
const CHOROPLETH_LAYER = 'choropleth-fill-layer';
const CHOROPLETH_LINE_LAYER = 'choropleth-line-layer';
const CHOROPLETH_FILL_LAYER = CHOROPLETH_LAYER;

interface ChoroplethPanelProps {
  tool: ChoroplethTool;
}

export function ChoroplethPanel({ tool }: ChoroplethPanelProps) {
  const state = tool.getState();
  const [data, setData] = useState<ParsedData | null>(state.data);
  const [regionNameCol, setRegionNameCol] = useState<string | null>(state.regionNameCol);
  const [valueCol, setValueCol] = useState<string | null>(state.valueCol);
  const [groupCol, setGroupCol] = useState<string | null>(state.groupCol);
  const [method, setMethod] = useState(state.method);
  const [k, setK] = useState(state.k);
  const [colorSchemeId, setColorSchemeId] = useState(state.colorSchemeId);
  const [matchedCount, setMatchedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [breaks, setBreaks] = useState<number[]>([]);
  const [range, setRange] = useState<[number, number]>([0, 1]);
  const [layerReady, setLayerReady] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // sync state from tool on mount
  const syncFromTool = useCallback(() => {
    const s = tool.getState();
    setData(s.data);
    setRegionNameCol(s.regionNameCol);
    setValueCol(s.valueCol);
    setGroupCol(s.groupCol);
    setMethod(s.method);
    setK(s.k);
    setColorSchemeId(s.colorSchemeId);
  }, [tool]);

  // subscribe to tool state changes
  useEffect(() => {
    tool.setOnStateChange(() => {
      syncFromTool();
    });
    return () => tool.setOnStateChange(null);
  }, [tool, syncFromTool]);

  // ---- file upload ----

  const handleFile = useCallback(
    (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'json') {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const obj = JSON.parse(reader.result as string);
            if (Array.isArray(obj)) {
              const columns = obj.length > 0 ? Object.keys(obj[0]) : [];
              tool.setData({ columns, rows: obj, rowCount: obj.length });
            } else {
              alert('JSON 需为对象数组格式 [{...}, {...}]');
            }
          } catch {
            alert('JSON 解析失败，请检查格式');
          }
        };
        reader.readAsText(file);
      } else if (ext === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const columns = results.meta.fields ?? [];
            const rows = results.data as Record<string, string | number>[];
            tool.setData({ columns, rows, rowCount: rows.length });
          },
          error: () => alert('CSV 解析失败，请检查编码和格式'),
        });
      } else {
        alert('仅支持 .csv 和 .json 格式');
      }
    },
    [tool],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  // ---- generate map ----

  const handleGenerate = useCallback(() => {
    if (!data || !regionNameCol || !valueCol) return;

    const engine = tool.getEngine();
    if (!engine) return;

    const native = engine.getNative() as maplibregl.Map | null;
    if (!native) return;

    // 1. build region values map
    const regionValues = new Map<string, number>();
    for (const row of data.rows) {
      const name = String(row[regionNameCol] ?? '').trim();
      const val = Number(row[valueCol]);
      if (name && !isNaN(val)) {
        regionValues.set(name, val);
      }
    }

    // 2. match regions to boundary data
    const countries = getCountries();
    const targetNames = countries.map((c) => c.nameZh || c.name);
    const inputs = [...regionValues.keys()];
    const results = matchRegions(inputs, targetNames);

    let m = 0;
    const nameToGeoKey = new Map<string, string>();
    for (const r of results) {
      if (r.matched) {
        nameToGeoKey.set(r.input, r.matched);
        m++;
      }
    }
    setMatchedCount(m);
    setTotalCount(inputs.length);

    // 3. build region values by boundary key
    const boundaryValues = new Map<string, number>();
    for (const [inputName, val] of regionValues) {
      const geoKey = nameToGeoKey.get(inputName);
      if (geoKey) boundaryValues.set(geoKey, val);
    }

    const values = [...boundaryValues.values()];

    // 4. classify
    const result = classify(values, method, k);
    setBreaks(result.breaks);
    setRange(result.range);

    // 5. pick colors
    const scheme = findColorScheme(colorSchemeId);
    if (!scheme) return;
    const colors = pickColors(scheme, method === 'continuous' ? 9 : result.breaks.length + 1);

    // 6. build GeoJSON with color property
    const features: Feature<Polygon | MultiPolygon>[] = [];
    for (const country of countries) {
      const key = country.nameZh || country.name;
      const val = boundaryValues.get(key);
      if (val === undefined) continue;

      const color = colorForValue(val, result.breaks, result.range, colors);

      const f: Feature<Polygon | MultiPolygon> = {
        type: 'Feature',
        properties: {
          name: country.nameZh || country.name,
          value: val,
          color,
        },
        geometry: country.feature.geometry,
      };
      features.push(f);
    }

    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features,
    };

    // 7. add/update MapLibre source + layer
    const source = native.getSource(CHOROPLETH_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(fc);
    } else {
      native.addSource(CHOROPLETH_SOURCE, {
        type: 'geojson',
        data: fc,
      });

      native.addLayer({
        id: CHOROPLETH_FILL_LAYER,
        type: 'fill',
        source: CHOROPLETH_SOURCE,
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.75,
          'fill-outline-color': 'rgba(255,255,255,0.15)',
        },
      });

      native.addLayer({
        id: CHOROPLETH_LINE_LAYER,
        type: 'line',
        source: CHOROPLETH_SOURCE,
        paint: {
          'line-color': 'rgba(255,255,255,0.25)',
          'line-width': 0.5,
        },
      });
    }

    setLayerReady(true);

    // 8. hover tooltip
    native.on('mousemove', CHOROPLETH_FILL_LAYER, (e) => {
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties as Record<string, unknown> | undefined;
        native.getCanvas().style.cursor = 'pointer';
        // Show popup
        if (props) {
          new maplibregl.Popup({
            closeButton: false,
            offset: 10,
            className: 'choropleth-popup',
          })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-size:12px;color:#fff">
                <strong>${props.name ?? ''}</strong><br/>
                值: ${Number(props.value).toLocaleString()}
              </div>`,
            )
            .addTo(native);
          // Keep reference for cleanup? Simpler: just let it replace
        }
      }
    });

    native.on('mouseleave', CHOROPLETH_FILL_LAYER, () => {
      native.getCanvas().style.cursor = '';
    });
  }, [data, regionNameCol, valueCol, method, k, colorSchemeId, tool]);

  // ---- cleanup on unmount ----

  useEffect(() => {
    return () => {
      const engine = tool.getEngine();
      if (!engine) return;
      const native = engine.getNative() as maplibregl.Map | null;
      if (!native) return;
      try {
        if (native.getLayer(CHOROPLETH_FILL_LAYER)) native.removeLayer(CHOROPLETH_FILL_LAYER);
        if (native.getLayer(CHOROPLETH_LINE_LAYER)) native.removeLayer(CHOROPLETH_LINE_LAYER);
        if (native.getSource(CHOROPLETH_SOURCE)) native.removeSource(CHOROPLETH_SOURCE);
      } catch { /* ignore */ }
    };
  }, [tool]);

  return (
    <div className="pw-panel-stack">
      <div className="pw-panel-footer">
        <span>数据状态</span>
        <span>{data ? `${data.rowCount} 行 × ${data.columns.length} 列` : '未加载'}</span>
      </div>

      {!data && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="pw-dropzone"
        >
          <FolderOpen size={25} />
          <strong>拖放 CSV 或 JSON 文件</strong>
          <small>或点击选择文件 (.csv / .json)</small>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* Data preview + config */}
      {data && (
        <>
          <DataPreview
            data={data}
            regionNameCol={regionNameCol}
            valueCol={valueCol}
            groupCol={groupCol}
            method={method}
            k={k}
            onRegionNameColChange={(c) => { setRegionNameCol(c); tool.setRegionNameCol(c); }}
            onValueColChange={(c) => { setValueCol(c); tool.setValueCol(c); }}
            onGroupColChange={(c) => { setGroupCol(c); tool.setGroupCol(c); }}
            onMethodChange={(m) => { setMethod(m); tool.setMethod(m); }}
            onKChange={(n) => { setK(n); tool.setK(n); }}
            matchedCount={matchedCount > 0 ? matchedCount : undefined}
            totalCount={totalCount > 0 ? totalCount : undefined}
          />

          {/* Color ramp picker */}
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textTransform: 'uppercase' }}>
              色阶方案
            </div>
            <ColorRampPicker
              value={colorSchemeId}
              k={k}
              onChange={(id) => { setColorSchemeId(id); tool.setColorSchemeId(id); }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={handleGenerate} className="pw-primary-button" style={{ flex: 1 }}>
              <MapPinned size={14} />生成地图
            </button>
            <button
              type="button"
              onClick={() => {
                tool.setData(null as unknown as ParsedData);
                setData(null);
                setLayerReady(false);
                setMatchedCount(0);
                setTotalCount(0);
              }}
              className="pw-secondary-button"
            >
              <RotateCcw size={13} />重置
            </button>
          </div>
        </>
      )}

      {/* Map Legend — overlaid */}
      {layerReady && (
        <MapLegend
          breaks={breaks}
          range={range}
          colorSchemeId={colorSchemeId}
          method={method}
        />
      )}
    </div>
  );
}
