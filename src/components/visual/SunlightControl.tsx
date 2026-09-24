// components/visual/SunlightControl.tsx — 阳光阴影与日照模拟控制面板
// 动态计算太阳方位角/高度角 + 视口中心追踪 + 昼夜暮光模拟 + 3D 光照与地形 Hillshade

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Info,
  Moon,
  Pause,
  Play,
  Sun,
  SunMedium,
  Sunrise,
  Sunset,
  Clock,
  MapPin,
} from 'lucide-react';
import { getPosition, getTimes } from 'suncalc';
import * as maplibregl from 'maplibre-gl';
import type { SunlightShadowTool } from '@tools/sunlight-shadow.tool';

const SUN_DEM_SOURCE = 'palm-sunlight-dem';
const SUN_HILLSHADE_LAYER = 'palm-sunlight-hillshade';
const TERRARIUM_TILES = [
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
];

interface SunlightControlProps {
  tool: SunlightShadowTool;
}

interface SunMetrics {
  azimuth: number; // 0°~360° 正北顺时针
  altitude: number; // -90°~+90°
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date | null;
  dayLengthStr: string;
}

export function SunlightControl({ tool }: SunlightControlProps) {
  const [date, setDate] = useState(tool.date);
  const [playing, setPlaying] = useState(tool.playing);
  const [center, setCenter] = useState<[number, number]>([116.4, 39.9]);
  const [metrics, setMetrics] = useState<SunMetrics | null>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);

  // 同步工具状态
  useEffect(() => {
    tool.setOnStateChange(() => {
      setDate(tool.date);
      setPlaying(tool.playing);
    });
    return () => tool.setOnStateChange(null);
  }, [tool]);

  // 监听地图视口移动，动态更新中心点经纬度
  useEffect(() => {
    const engine = tool.engine;
    if (!engine) return;
    const map = engine.getNative() as maplibregl.Map | null;
    if (!map) return;
    mapRef.current = map;

    const onMove = () => {
      const c = map.getCenter();
      setCenter([c.lng, c.lat]);
    };
    onMove();
    map.on('moveend', onMove);
    return () => {
      map.off('moveend', onMove);
    };
  }, [tool]);

  // 基于当前视口中心坐标与时间计算太阳精确天球参数及日出日落
  useEffect(() => {
    try {
      const lng = center[0];
      const lat = center[1];
      const pos = getPosition(date, lat, lng);

      // SunCalc 方位角以正南为0，向西为正。转为以正北为0的标准罗盘方位角 (0°~360°)
      const azimuthDeg = (((pos.azimuth * 180) / Math.PI + 180) % 360 + 360) % 360;
      // 高度角转度数 (-90° ~ +90°)
      const altitudeDeg = (pos.altitude * 180) / Math.PI;

      // 日出日落及昼长
      const times = getTimes(date, lat, lng);
      let dayLengthStr = '--';
      if (times.sunrise && times.sunset && !isNaN(times.sunrise.getTime()) && !isNaN(times.sunset.getTime())) {
        const diffMs = times.sunset.getTime() - times.sunrise.getTime();
        if (diffMs > 0) {
          const totalMins = Math.round(diffMs / (60 * 1000));
          const h = Math.floor(totalMins / 60);
          const m = totalMins % 60;
          dayLengthStr = `${h}小时${m}分`;
        }
      }

      const isValidDate = (d?: Date | null): d is Date => !!d && !isNaN(d.getTime());

      setMetrics({
        azimuth: azimuthDeg,
        altitude: altitudeDeg,
        sunrise: isValidDate(times.sunrise) ? times.sunrise : null,
        sunset: isValidDate(times.sunset) ? times.sunset : null,
        solarNoon: isValidDate(times.solarNoon) ? times.solarNoon : null,
        dayLengthStr,
      });
    } catch {
      setMetrics(null);
    }
  }, [date, center]);

  // 更新地图 3D 光照与地形 Hillshade
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !metrics) return;

    const render = () => applySunlight(map, metrics.azimuth, metrics.altitude);
    render();
    map.on('style.load', render);
    return () => {
      map.off('style.load', render);
    };
  }, [metrics]);

  // 组件卸载时清理图层与光源
  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (!map) return;
      cleanupSunlight(map);
    };
  }, []);

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeLabel = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  const handleTimeSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const totalMins = Number(e.target.value);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      const d = new Date(date);
      d.setHours(h, m, 0, 0);
      tool.setDate(d);
    },
    [date, tool],
  );

  const jumpToTime = useCallback(
    (target: Date | null) => {
      if (!target) return;
      const d = new Date(date);
      d.setHours(target.getHours(), target.getMinutes(), 0, 0);
      tool.setDate(d);
    },
    [date, tool],
  );

  const altitude = metrics?.altitude ?? 0;
  const azimuth = metrics?.azimuth ?? 180;

  // 大气天色滤镜（通过 Portal 投射至全屏地图）
  const overlayBg = useMemo(() => {
    if (altitude < -12) {
      // 深夜 / 天文曙暮光
      return 'rgba(2, 6, 22, 0.65)';
    }
    if (altitude < -6) {
      // 航海薄暮
      return 'rgba(12, 16, 38, 0.48)';
    }
    if (altitude < 0) {
      // 民用薄暮（太阳刚沉地平线）
      return 'rgba(28, 20, 44, 0.32)';
    }
    if (altitude < 8) {
      // 晨昏金晖（日出/日落黄金时刻）
      return 'rgba(255, 135, 35, 0.18)';
    }
    if (altitude < 25) {
      // 斜阳柔光
      return 'rgba(255, 225, 140, 0.08)';
    }
    // 正午明亮晴朗
    return 'rgba(255, 250, 235, 0.02)';
  }, [altitude]);

  // 格式化时间辅助函数
  const fmtTime = (d: Date | null) => {
    if (!d) return '--:--';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <>
      {/* 全屏大气天色滤镜 (Portal 挂载在 body，不挡鼠标操作) */}
      {createPortal(
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 650,
            pointerEvents: 'none',
            background: overlayBg,
            transition: 'background 300ms ease-out',
          }}
        />,
        document.body,
      )}

      <div className="pw-panel-stack">
        {/* 标题与当前时间 */}
        <div className="pw-panel-footer" style={{ paddingBottom: 4 }}>
          <span className="pw-panel-status" style={{ fontWeight: 600 }}>
            <Sun size={15} style={{ color: altitude > 0 ? '#f59e0b' : '#64748b' }} />
            <span>太阳位置与日照</span>
          </span>
          <strong
            style={{
              color: altitude > 0 ? 'var(--pw-warning)' : '#94a3b8',
              font: '700 16px ui-monospace, SFMono-Regular, Consolas, monospace',
            }}
          >
            {timeLabel}
          </strong>
        </div>

        {/* 视口中心提示 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            color: 'var(--pw-text-faint)',
          }}
        >
          <MapPin size={11} />
          <span>
            视口中心：{center[0].toFixed(2)}°E, {center[1].toFixed(2)}°N
          </span>
        </div>

        {/* 时间进度滑块 (0 ~ 1439 分钟) */}
        <div>
          <input
            type="range"
            min={0}
            max={1439}
            value={hours * 60 + minutes}
            onChange={handleTimeSlider}
            style={{ width: '100%' }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 9,
              color: 'var(--pw-text-faint)',
              marginTop: 2,
            }}
          >
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>

        {/* 日期选择器 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="date"
            value={date.toISOString().slice(0, 10)}
            onChange={(e) => {
              if (!e.target.value) return;
              const d = new Date(e.target.value);
              d.setHours(date.getHours(), date.getMinutes(), 0, 0);
              tool.setDate(d);
            }}
            className="pw-secondary-button"
            style={{ flex: 1, padding: '5px 8px', fontSize: 11 }}
          />
          <button
            type="button"
            onClick={() => tool.resetToNow()}
            className="pw-secondary-button"
            title="恢复为当前系统时间"
            style={{ padding: '5px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Clock size={12} />
            <span>现在</span>
          </button>
        </div>

        {/* 关键时刻一键跳转快捷键 */}
        {metrics && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 4,
              marginTop: 2,
            }}
          >
            <button
              type="button"
              onClick={() => jumpToTime(metrics.sunrise)}
              className="pw-secondary-button"
              style={{
                fontSize: 10,
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
              title="跳转至日出时刻"
            >
              <Sunrise size={12} style={{ color: '#f59e0b' }} />
              <span>日出 {fmtTime(metrics.sunrise)}</span>
            </button>
            <button
              type="button"
              onClick={() => jumpToTime(metrics.solarNoon)}
              className="pw-secondary-button"
              style={{
                fontSize: 10,
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
              title="跳转至正午时刻"
            >
              <Sun size={12} style={{ color: '#eab308' }} />
              <span>正午 {fmtTime(metrics.solarNoon)}</span>
            </button>
            <button
              type="button"
              onClick={() => jumpToTime(metrics.sunset)}
              className="pw-secondary-button"
              style={{
                fontSize: 10,
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
              title="跳转至日落时刻"
            >
              <Sunset size={12} style={{ color: '#f97316' }} />
              <span>日落 {fmtTime(metrics.sunset)}</span>
            </button>
          </div>
        )}

        {/* 太阳罗盘与天球参数视窗 */}
        {metrics && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 8,
              padding: '8px 10px',
              border: '1px solid var(--pw-border)',
            }}
          >
            {/* SVG 太阳天球罗盘微件 */}
            <SolarCompassWidget azimuth={azimuth} altitude={altitude} />

            {/* 详细参数指标 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--pw-text-faint)' }}>方位角:</span>
                <b style={{ color: '#38bdf8' }}>
                  {azimuth.toFixed(1)}° ({getCompassHeading(azimuth)})
                </b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--pw-text-faint)' }}>高度角:</span>
                <b style={{ color: altitude > 0 ? '#f59e0b' : '#94a3b8' }}>{altitude.toFixed(1)}°</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--pw-text-faint)' }}>今日昼长:</span>
                <b style={{ color: 'var(--pw-text)' }}>{metrics.dayLengthStr}</b>
              </div>
              <div style={{ marginTop: 2 }}>
                {altitude > 0 ? (
                  <span className="pw-panel-status is-warning" style={{ fontSize: 10 }}>
                    <SunMedium size={12} />
                    <span>日照中 ({altitude < 12 ? '低角度晨昏长阴影' : '充足日照'})</span>
                  </span>
                ) : (
                  <span className="pw-panel-status is-danger" style={{ fontSize: 10 }}>
                    <Moon size={12} />
                    <span>地平线下 ({altitude > -6 ? '民用暮光' : '静谧夜色'})</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 播放控制栏 */}
        <div className="pw-panel-toolbar" style={{ marginTop: 4 }}>
          <button
            type="button"
            onClick={() => tool.setPlaying(!playing)}
            className={playing ? 'pw-danger-button' : 'pw-primary-button'}
            style={{ flex: 1 }}
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
            {playing ? '暂停日照演进' : '开始时间延时播放'}
          </button>
          <label className="pw-panel-status" style={{ flexShrink: 0 }}>
            <span>倍速:</span>
            <select
              value={tool.playSpeed}
              onChange={(e) => tool.setPlaySpeed(Number(e.target.value))}
              className="pw-secondary-button"
              style={{ padding: '3px 6px', fontSize: 11 }}
            >
              <option value={15}>15分/秒</option>
              <option value={30}>30分/秒</option>
              <option value={60}>1小时/秒</option>
              <option value={120}>2小时/秒</option>
            </select>
          </label>
        </div>

        {/* 科学说明 */}
        <div className="pw-panel-note" style={{ fontSize: 10, lineHeight: 1.4 }}>
          <Info size={13} />
          <span>
            基于真实太阳物理角度驱动：地形 DEM 呈现山脊明暗阴影，3D 建筑同步朝向背阴面。
          </span>
        </div>
      </div>
    </>
  );
}

// ---- SVG 太阳天球罗盘微部件 ----

function SolarCompassWidget({ azimuth, altitude }: { azimuth: number; altitude: number }) {
  const dialRadius = 36;
  const cx = 45;
  const cy = 45;

  // 仰角映射为距离中心的半径：90°位于圆心，0°位于地平线边缘，<0°位于圆环外侧虚线区
  const clampedAlt = Math.max(-15, Math.min(90, altitude));
  const r = (1 - clampedAlt / 90) * dialRadius;

  const rad = (azimuth * Math.PI) / 180;
  const sunX = cx + r * Math.sin(rad);
  const sunY = cy - r * Math.cos(rad);

  const isDay = altitude > 0;

  return (
    <svg width={90} height={90} viewBox="0 0 90 90" style={{ flexShrink: 0 }}>
      {/* 地平圈基底 */}
      <circle cx={cx} cy={cy} r={dialRadius} fill="rgba(0, 0, 0, 0.45)" stroke="rgba(255, 255, 255, 0.15)" strokeWidth={1} />
      {/* 45° 仰角辅助参考同心圆 */}
      <circle cx={cx} cy={cy} r={dialRadius / 2} fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="2 2" strokeWidth={1} />
      {/* 子午线与卯酉圈 */}
      <line x1={cx} y1={cx - dialRadius} x2={cx} y2={cx + dialRadius} stroke="rgba(255, 255, 255, 0.12)" strokeWidth={1} />
      <line x1={cy - dialRadius} y1={cy} x2={cy + dialRadius} y2={cy} stroke="rgba(255, 255, 255, 0.12)" strokeWidth={1} />

      {/* 方位标签 */}
      <text x={cx} y={cx - dialRadius + 8} fill="#ef4444" fontSize={8} fontWeight="bold" textAnchor="middle">
        N
      </text>
      <text x={cx + dialRadius - 6} y={cy + 3} fill="rgba(255,255,255,0.4)" fontSize={7} textAnchor="middle">
        E
      </text>
      <text x={cx} y={cy + dialRadius - 3} fill="rgba(255,255,255,0.4)" fontSize={7} textAnchor="middle">
        S
      </text>
      <text x={cx - dialRadius + 6} y={cy + 3} fill="rgba(255,255,255,0.4)" fontSize={7} textAnchor="middle">
        W
      </text>

      {/* 太阳投射光线 */}
      <line
        x1={cx}
        y1={cy}
        x2={sunX}
        y2={sunY}
        stroke={isDay ? 'rgba(245, 158, 11, 0.5)' : 'rgba(100, 116, 139, 0.3)'}
        strokeWidth={1.5}
      />

      {/* 太阳本体 */}
      <circle
        cx={sunX}
        cy={sunY}
        r={isDay ? 5 : 3.5}
        fill={isDay ? '#f59e0b' : '#64748b'}
        stroke="#ffffff"
        strokeWidth={1.2}
      />
    </svg>
  );
}

// 罗盘八方位中文转换
function getCompassHeading(deg: number): string {
  const headings = ['正北', '东北', '正东', '东南', '正南', '西南', '正西', '西北'];
  const idx = Math.round(deg / 45) % 8;
  return headings[idx] ?? '正北';
}

// ---- 地图光照与地形渲染 ----

function applySunlight(map: maplibregl.Map, azimuth: number, altitude: number): void {
  try {
    // 1. 确保 Terrarium DEM 源已添加
    if (!map.getSource(SUN_DEM_SOURCE)) {
      map.addSource(SUN_DEM_SOURCE, {
        type: 'raster-dem',
        encoding: 'terrarium',
        tiles: TERRARIUM_TILES,
        tileSize: 256,
        maxzoom: 15,
      });
    }

    // 2. 将 Hillshade 层插入到底层（置于首个文字标注 Symbol 层之下，确保道路与地名清晰可读）
    if (!map.getLayer(SUN_HILLSHADE_LAYER)) {
      const layers = map.getStyle().layers ?? [];
      let firstSymbolLayerId: string | undefined;
      for (const l of layers) {
        if (l.type === 'symbol') {
          firstSymbolLayerId = l.id;
          break;
        }
      }

      map.addLayer(
        {
          id: SUN_HILLSHADE_LAYER,
          type: 'hillshade',
          source: SUN_DEM_SOURCE,
          paint: {
            'hillshade-illumination-anchor': 'map',
            'hillshade-exaggeration': 0.75,
          },
        },
        firstSymbolLayerId,
      );
    }

    // 3. 配置太阳入射方位角
    map.setPaintProperty(SUN_HILLSHADE_LAYER, 'hillshade-illumination-direction', azimuth);

    // 4. 地形起伏阴影夸张度（低角度晨昏投射长阴影，正午阴影收缩，夜间暗淡）
    const exaggeration =
      altitude <= 0
        ? 0.22
        : altitude < 15
          ? 0.98
          : Math.max(0.42, 0.98 - (altitude - 15) / 100);

    map.setPaintProperty(SUN_HILLSHADE_LAYER, 'hillshade-exaggeration', exaggeration);

    // 5. 阴影与高光颜色物理拟真
    map.setPaintProperty(
      SUN_HILLSHADE_LAYER,
      'hillshade-shadow-color',
      altitude <= 0 ? 'rgba(3, 8, 24, 0.95)' : 'rgba(16, 25, 48, 0.85)',
    );
    map.setPaintProperty(
      SUN_HILLSHADE_LAYER,
      'hillshade-highlight-color',
      altitude <= 0
        ? 'rgba(60, 85, 125, 0.12)'
        : altitude < 12
          ? 'rgba(255, 168, 64, 0.88)' // 晨昏金橙光芒
          : 'rgba(255, 248, 215, 0.82)', // 日间明亮暖白
    );

    // 6. 同步 MapLibre 原生 3D 光照（驱动 3D 建筑及 3D 图层真实侧光投射）
    const polarAngle = Math.max(1, Math.min(90, 90 - Math.max(0, altitude)));
    const isDay = altitude > 0;
    map.setLight({
      anchor: 'map',
      color: isDay
        ? altitude < 12
          ? '#ffa154' // 黄金时刻温暖暖色
          : '#fffdf5' // 白昼自然采光
        : '#475569', // 夜间冷光
      position: [1.15, azimuth, polarAngle],
      intensity: isDay ? (altitude < 12 ? 0.92 : 0.85) : 0.18,
    });
  } catch (error) {
    console.warn('[Sunlight] hillshade update failed:', error);
  }
}

function cleanupSunlight(map: maplibregl.Map): void {
  try {
    if (map.getLayer(SUN_HILLSHADE_LAYER)) {
      map.removeLayer(SUN_HILLSHADE_LAYER);
    }
  } catch {
    /* */
  }
  try {
    if (map.getSource(SUN_DEM_SOURCE)) {
      map.removeSource(SUN_DEM_SOURCE);
    }
  } catch {
    /* */
  }
}
