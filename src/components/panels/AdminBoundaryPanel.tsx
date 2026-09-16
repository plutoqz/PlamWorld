// components/panels/AdminBoundaryPanel.tsx — 行政区图层控制面板 (升级版)
//
// 支持全球国界、中国省级、地市级、区县级与国际大都市多层级下钻与检索。
// 提供面包屑级联导航、实时模糊检索定位、样式微调与属性卡片。

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Focus,
  FolderTree,
  Globe2,
  LandPlot,
  Layers,
  Loader2,
  MapPin,
  Palette,
  RotateCcw,
  Search,
  Sliders,
  X,
} from 'lucide-react';
import type { AdminBoundaryTool } from '@tools/admin-boundary.tool';
import type { AdminRegion } from '@core/admin-boundary';

const SRC_ID = 'palm-admin-src';
const FILL_LAYER = 'palm-admin-fill';
const LINE_LAYER = 'palm-admin-line';
const HIGHLIGHT_LINE_LAYER = 'palm-admin-highlight-line';
const HIGHLIGHT_FILL_LAYER = 'palm-admin-highlight-fill';
const SYMBOL_LAYER = 'palm-admin-symbol';

const PRESET_COLORS = [
  { name: '极光绿', hex: '#38c49b' },
  { name: '科技蓝', hex: '#55a8e8' },
  { name: '纯净白', hex: '#f4f7f8' },
  { name: '琥珀金', hex: '#e8ad55' },
  { name: '珊瑚粉', hex: '#e66b6b' },
  { name: '深炭灰', hex: '#6f7a82' },
];

interface AdminBoundaryPanelProps {
  tool: AdminBoundaryTool;
}

export function AdminBoundaryPanel({ tool }: AdminBoundaryPanelProps) {
  const [showCountries, setShowCountries] = useState(tool.state.showCountries);
  const [showProvinces, setShowProvinces] = useState(tool.state.showProvinces);
  const [showGlobalCities, setShowGlobalCities] = useState(tool.state.showGlobalCities);
  const [fillMode, setFillMode] = useState(tool.state.fillMode);
  const [showLabels, setShowLabels] = useState(tool.state.showLabels);
  const [borderColor, setBorderColor] = useState(tool.state.borderColor);
  const [borderWidth, setBorderWidth] = useState(tool.state.borderWidth);
  const [fillOpacity, setFillOpacity] = useState(tool.state.fillOpacity);
  const [selectedRegion, setSelectedRegion] = useState<AdminRegion | null>(
    tool.state.selectedRegion,
  );
  const [activeSubdivisions, setActiveSubdivisions] = useState(tool.state.activeSubdivisions);
  const [breadcrumbs, setBreadcrumbs] = useState(tool.state.breadcrumbs);
  const [loadingSubdivisions, setLoadingSubdivisions] = useState(
    tool.state.loadingSubdivisions,
  );
  const [searchQuery, setSearchQuery] = useState('');

  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // 状态同步
  useEffect(() => {
    const handleStateChange = () => {
      setShowCountries(tool.state.showCountries);
      setShowProvinces(tool.state.showProvinces);
      setShowGlobalCities(tool.state.showGlobalCities);
      setFillMode(tool.state.fillMode);
      setShowLabels(tool.state.showLabels);
      setBorderColor(tool.state.borderColor);
      setBorderWidth(tool.state.borderWidth);
      setFillOpacity(tool.state.fillOpacity);
      setSelectedRegion(tool.state.selectedRegion);
      setActiveSubdivisions(tool.state.activeSubdivisions);
      setBreadcrumbs(tool.state.breadcrumbs);
      setLoadingSubdivisions(tool.state.loadingSubdivisions);
    };
    tool.setOnStateChange(handleStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool]);

  // 清理图层
  const cleanupLayers = useCallback((map: maplibregl.Map) => {
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
    const layers = [
      SYMBOL_LAYER,
      HIGHLIGHT_LINE_LAYER,
      HIGHLIGHT_FILL_LAYER,
      LINE_LAYER,
      FILL_LAYER,
    ];
    layers.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });
    if (map.getSource(SRC_ID)) {
      map.removeSource(SRC_ID);
    }
  }, []);

  // 挂载地图引用
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map;
    if (!map) return;
    mapRef.current = map;

    return () => {
      cleanupLayers(map);
    };
  }, [tool, cleanupLayers]);

  // 飞向目标区域
  const handleFlyToRegion = useCallback((region: AdminRegion) => {
    const map = mapRef.current;
    if (!map) return;
    tool.setSelectedRegion(region);

    map.fitBounds(region.bounds, {
      padding: { top: 60, bottom: 60, left: 320, right: 60 },
      duration: 1000,
      maxZoom: region.level === 'county' ? 12 : region.level === 'city' ? 9 : 6,
    });
  }, [tool]);

  // 下钻动作
  const handleDrillDown = useCallback(async (region: AdminRegion) => {
    await tool.drillDown(region);
    handleFlyToRegion(region);
  }, [tool, handleFlyToRegion]);

  const handleDrillDownRef = useRef(handleDrillDown);
  handleDrillDownRef.current = handleDrillDown;
  const handleFlyToRegionRef = useRef(handleFlyToRegion);
  handleFlyToRegionRef.current = handleFlyToRegion;

  // 更新与渲染 GeoJSON 图层
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!showCountries && !showProvinces && !showGlobalCities && activeSubdivisions.length === 0) {
      cleanupLayers(map);
      return;
    }

    const geojsonData = tool.getCombinedGeoJson();
    const source = map.getSource(SRC_ID) as maplibregl.GeoJSONSource | undefined;

    if (source) {
      source.setData(geojsonData);
    } else {
      map.addSource(SRC_ID, {
        type: 'geojson',
        data: geojsonData,
      });

      // 1. 区域多边形填充层 (用于点击探测与半透着色)
      map.addLayer({
        id: FILL_LAYER,
        type: 'fill',
        source: SRC_ID,
        paint: {
          'fill-color': [
            'case',
            ['==', ['get', 'level'], 'province'],
            borderColor,
            ['==', ['get', 'level'], 'city'],
            '#4a90e2',
            ['==', ['get', 'level'], 'county'],
            '#e8ad55',
            ['==', ['get', 'level'], 'global-city'],
            '#b37feb',
            '#2b4c7e',
          ],
          'fill-opacity': fillMode === 'soft-fill' ? fillOpacity : 0.01,
        },
      });

      // 2. 边界线条层 (带平滑抗锯齿)
      map.addLayer({
        id: LINE_LAYER,
        type: 'line',
        source: SRC_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'level'], 'county'],
            '#ffd591',
            ['==', ['get', 'level'], 'city'],
            '#91d5ff',
            ['==', ['get', 'level'], 'global-city'],
            '#d3adf7',
            borderColor,
          ],
          'line-width': borderWidth,
          'line-opacity': 0.88,
        },
      });

      // 3. 高亮选中填充层
      map.addLayer({
        id: HIGHLIGHT_FILL_LAYER,
        type: 'fill',
        source: SRC_ID,
        filter: ['==', ['get', 'id'], selectedRegion?.id ?? ''],
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': 0.28,
        },
      });

      // 4. 高亮选中边框层
      map.addLayer({
        id: HIGHLIGHT_LINE_LAYER,
        type: 'line',
        source: SRC_ID,
        filter: ['==', ['get', 'id'], selectedRegion?.id ?? ''],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#ffff00',
          'line-width': Math.max(borderWidth + 1.8, 3.2),
          'line-opacity': 1.0,
        },
      });

      // 5. 注记符号层 (地名文本)
      map.addLayer({
        id: SYMBOL_LAYER,
        type: 'symbol',
        source: SRC_ID,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            2,
            9,
            6,
            11,
            10,
            13,
          ],
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          visibility: showLabels ? 'visible' : 'none',
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#0a0f1d',
          'text-halo-width': 1.8,
        },
      });

      // 鼠标悬停事件
      map.on('mousemove', FILL_LAYER, (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties as Record<string, any>;
        map.getCanvas().style.cursor = 'pointer';

        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 12,
            className: 'pw-admin-popup',
          });
        }

        const levelLabel =
          props.level === 'country'
            ? '主权国家'
            : props.level === 'province'
              ? '省级行政区'
              : props.level === 'city'
                ? '地市级'
                : props.level === 'county'
                  ? '县级行政区'
                  : '国际城市/大都市区';

        popupRef.current
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-size:12px; font-weight:600; color:#fff;">
              ${props.name || ''}
              <span style="font-size:10px; opacity:0.75; font-weight:normal; margin-left:4px;">
                (${levelLabel})
              </span>
            </div>`,
          )
          .addTo(map);
      });

      map.on('mouseleave', FILL_LAYER, () => {
        map.getCanvas().style.cursor = '';
        popupRef.current?.remove();
        popupRef.current = null;
      });

      // 鼠标点击事件 -> 触发下钻或聚焦选中
      map.on('click', FILL_LAYER, async (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties as Record<string, any>;
        const regionId = props.id || '';
        const regionCode = String(props.code || '');

        // 查找对应 region 对象
        const allSubs = tool.state.activeSubdivisions;
        const allProvs = tool.getAllProvinces();
        const allGlobalCities = tool.getAllGlobalCities();
        const allCountries = tool.getAllCountries();

        let target: AdminRegion | null =
          allSubs.find((s) => s.id === regionId || s.code === regionCode) ??
          allProvs.find((p) => p.id === regionId || p.code === regionCode) ??
          allGlobalCities.find((g) => g.id === regionId || g.code === regionCode) ??
          allCountries.find((c) => c.id === regionId || c.code === regionCode) ??
          null;

        if (target) {
          if (target.level === 'country' || target.level === 'global-city') {
            tool.setSelectedRegion(target);
            handleFlyToRegionRef.current(target);
          } else {
            await handleDrillDownRef.current(target);
          }
        }
      });
    }

    // 动态样式更新
    if (map.getLayer(FILL_LAYER)) {
      map.setPaintProperty(FILL_LAYER, 'fill-opacity', fillMode === 'soft-fill' ? fillOpacity : 0.01);
    }
    if (map.getLayer(LINE_LAYER)) {
      map.setPaintProperty(LINE_LAYER, 'line-width', borderWidth);
    }
    if (map.getLayer(SYMBOL_LAYER)) {
      map.setLayoutProperty(SYMBOL_LAYER, 'visibility', showLabels ? 'visible' : 'none');
    }
    if (map.getLayer(HIGHLIGHT_LINE_LAYER)) {
      map.setFilter(HIGHLIGHT_LINE_LAYER, ['==', ['get', 'id'], selectedRegion?.id ?? '']);
    }
    if (map.getLayer(HIGHLIGHT_FILL_LAYER)) {
      map.setFilter(HIGHLIGHT_FILL_LAYER, ['==', ['get', 'id'], selectedRegion?.id ?? '']);
    }
  }, [
    showCountries,
    showProvinces,
    showGlobalCities,
    fillMode,
    showLabels,
    borderColor,
    borderWidth,
    fillOpacity,
    selectedRegion,
    activeSubdivisions,
    breadcrumbs,
    tool,
    cleanupLayers,
  ]);

  // 点击面包屑导航条跳转
  const handleBreadcrumbClick = async (index: number) => {
    await tool.drillToBreadcrumb(index);
    const map = mapRef.current;
    if (!map) return;

    if (index === 0) {
      map.flyTo({
        center: [105, 35],
        zoom: 3.8,
        duration: 900,
      });
    } else {
      const item = tool.state.breadcrumbs[index];
      if (item?.region) {
        handleFlyToRegion(item.region);
      }
    }
  };

  // 搜索匹配
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return tool.searchRegions(searchQuery);
  }, [searchQuery, tool]);

  return (
    <div className="pw-panel-stack" style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      {/* 1. 面包屑下钻导航条 */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '8px 10px',
          borderRadius: 6,
          background: 'var(--pw-surface-raised)',
          border: '1px solid var(--pw-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, opacity: 0.8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600, color: 'var(--pw-accent)' }}>
            <FolderTree size={13} />
            <span>当前下钻路径</span>
          </span>
          {loadingSubdivisions && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--pw-accent)', fontSize: 11 }}>
              <Loader2 size={12} className="pw-spinner" style={{ animation: 'spin 1s linear infinite' }} />
              <span>载入区划中...</span>
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexWrap: 'wrap',
            fontSize: 12,
          }}
        >
          {breadcrumbs.map((b, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <ChevronRight size={12} style={{ opacity: 0.4 }} />}
                <button
                  type="button"
                  onClick={() => handleBreadcrumbClick(i)}
                  title={isLast ? '当前所在层级' : `回溯至 ${b.name}`}
                  style={{
                    background: isLast ? 'rgba(56, 196, 155, 0.15)' : 'none',
                    border: isLast ? '1px solid var(--pw-accent-soft)' : '1px solid transparent',
                    borderRadius: 4,
                    color: isLast ? 'var(--pw-accent)' : 'inherit',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    fontWeight: isLast ? 600 : 400,
                    textDecoration: isLast ? 'none' : 'underline',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {b.name}
                </button>
              </span>
            );
          })}
        </div>

        <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
          💡 点击地图上的省/市或搜索即可向下钻取；点击上方路径节点可即时回溯。
        </div>
      </section>

      {/* 2. 行政边界层级开关 */}
      <section className="pw-tool-config-group">
        <label className="pw-group-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Layers size={14} />
          <span>行政边界层级</span>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={showProvinces}
              onChange={(e) => tool.setShowProvinces(e.target.checked)}
              style={{ accentColor: 'var(--pw-accent)' }}
            />
            <span>中国省级行政区 (34 省区市 / 特别行政区)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={showCountries}
              onChange={(e) => tool.setShowCountries(e.target.checked)}
              style={{ accentColor: 'var(--pw-accent)' }}
            />
            <span>全球主权国家界线 (240+ 国家和地区，50m 高清)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={showGlobalCities}
              onChange={(e) => tool.setShowGlobalCities(e.target.checked)}
              style={{ accentColor: 'var(--pw-accent)' }}
            />
            <span>国际重点大都市区 (纽约/伦敦/东京/巴黎/悉尼等)</span>
          </label>
        </div>
      </section>

      {/* 3. 渲染样式模式 */}
      <section className="pw-tool-config-group">
        <label className="pw-group-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Palette size={14} />
          <span>渲染样式</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className={`pw-segment-button ${fillMode === 'outline' ? 'is-active' : ''}`}
            onClick={() => tool.setFillMode('outline')}
            style={{ padding: '6px 10px', fontSize: 12 }}
          >
            仅高清边界线
          </button>
          <button
            type="button"
            className={`pw-segment-button ${fillMode === 'soft-fill' ? 'is-active' : ''}`}
            onClick={() => tool.setFillMode('soft-fill')}
            style={{ padding: '6px 10px', fontSize: 12 }}
          >
            半透明色块着色
          </button>
        </div>

        {/* 注记开关 */}
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => tool.setShowLabels(!showLabels)}
            className="pw-secondary-button"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
          >
            {showLabels ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>{showLabels ? '隐藏地名注记' : '显示地名注记'}</span>
          </button>
        </div>
      </section>

      {/* 4. 视觉微调 */}
      <section className="pw-tool-config-group">
        <label className="pw-group-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sliders size={14} />
          <span>视觉微调</span>
        </label>

        {/* 预设调色板 */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              title={c.name}
              onClick={() => tool.setBorderColor(c.hex)}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: c.hex,
                border: borderColor === c.hex ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              {borderColor === c.hex && <Check size={12} color={c.hex === '#f4f7f8' ? '#000' : '#fff'} />}
            </button>
          ))}
        </div>

        {/* 线宽滑块 */}
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
            <span>平滑边界线宽</span>
            <span>{borderWidth.toFixed(1)} px</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="4.0"
            step="0.5"
            value={borderWidth}
            onChange={(e) => tool.setBorderWidth(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--pw-accent)' }}
          />
        </div>

        {/* 填充透明度滑块 */}
        {fillMode === 'soft-fill' && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
              <span>色块不透明度</span>
              <span>{Math.round(fillOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.65"
              step="0.05"
              value={fillOpacity}
              onChange={(e) => tool.setFillOpacity(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--pw-accent)' }}
            />
          </div>
        )}
      </section>

      {/* 5. 全国县/市及国际大都市区即时检索 */}
      <section className="pw-tool-config-group">
        <label className="pw-group-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={14} />
          <span>全国县/市及国际都市检索</span>
        </label>
        <div style={{ position: 'relative', marginTop: 8 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索全国省市县或国际城市 (如: 长沙县、海淀、东京、巴黎...)"
            style={{
              width: '100%',
              padding: '7px 28px 7px 10px',
              fontSize: 12,
              borderRadius: 6,
              background: 'var(--pw-surface)',
              border: '1px solid var(--pw-border)',
              color: 'var(--pw-text)',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--pw-text-muted)',
                cursor: 'pointer',
                display: 'flex',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* 搜索匹配列表 */}
        {searchResults.length > 0 && (
          <div
            style={{
              marginTop: 6,
              maxHeight: 180,
              overflowY: 'auto',
              borderRadius: 6,
              border: '1px solid var(--pw-border)',
              background: 'var(--pw-surface-raised)',
            }}
          >
            {searchResults.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={async () => {
                  setSearchQuery('');
                  await handleDrillDown(r);
                }}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 12,
                }}
                className="pw-hover-surface"
              >
                <div>
                  <strong>{r.nameZh}</strong>
                  {r.parentName && (
                    <small style={{ marginLeft: 6, opacity: 0.6 }}>· {r.parentName}</small>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'rgba(255,255,255,0.08)',
                    opacity: 0.8,
                  }}
                >
                  {r.level === 'country'
                    ? '国家'
                    : r.level === 'province'
                      ? '省区'
                      : r.level === 'city'
                        ? '地市'
                        : r.level === 'county'
                          ? '区县'
                          : '国际都市'}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 6. 选中行政区属性与下钻卡片 */}
      {selectedRegion && (
        <section
          style={{
            padding: 12,
            borderRadius: 8,
            border: '1px solid var(--pw-accent-soft)',
            background: 'rgba(56, 196, 155, 0.07)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {selectedRegion.level === 'global-city' ? (
                <Globe2 size={16} color="var(--pw-accent)" />
              ) : selectedRegion.level === 'county' ? (
                <LandPlot size={16} color="#ffd591" />
              ) : (
                <MapPin size={16} color="var(--pw-accent)" />
              )}
              <strong style={{ fontSize: 14 }}>{selectedRegion.nameZh}</strong>
              <small style={{ opacity: 0.7 }}>{selectedRegion.nameEn}</small>
            </div>
            <button
              type="button"
              onClick={() => tool.setSelectedRegion(null)}
              title="清除选中"
              style={{ background: 'none', border: 'none', color: 'var(--pw-text-muted)', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', fontSize: 11, opacity: 0.85 }}>
            <div>行政代码: {selectedRegion.code}</div>
            <div>
              层级:{' '}
              {selectedRegion.level === 'country'
                ? '主权国家'
                : selectedRegion.level === 'province'
                  ? '省级行政区'
                  : selectedRegion.level === 'city'
                    ? '地市级'
                    : selectedRegion.level === 'county'
                      ? '县级行政区'
                      : '国际都市区'}
            </div>
            {selectedRegion.parentName && <div>归属: {selectedRegion.parentName}</div>}
            {selectedRegion.capital && <div>中心/省会: {selectedRegion.capital}</div>}
            <div>
              中心坐标: {selectedRegion.center[0].toFixed(2)}°, {selectedRegion.center[1].toFixed(2)}°
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => handleFlyToRegion(selectedRegion)}
              className="pw-primary-button"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
            >
              <Focus size={13} />
              <span>聚焦视口</span>
            </button>

            {(selectedRegion.level === 'province' || selectedRegion.level === 'city') && (
              <button
                type="button"
                onClick={() => handleDrillDown(selectedRegion)}
                className="pw-secondary-button"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
              >
                <ChevronRight size={13} />
                <span>下钻下级区划</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* 7. 重置操作 */}
      <div style={{ marginTop: 'auto', paddingTop: 6 }}>
        <button
          type="button"
          onClick={() => {
            tool.reset();
            setSearchQuery('');
            mapRef.current?.flyTo({
              center: [105, 35],
              zoom: 3.8,
              duration: 900,
            });
          }}
          className="pw-secondary-button"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
        >
          <RotateCcw size={13} />
          <span>重置为宏观总览</span>
        </button>
      </div>
    </div>
  );
}
