// components/terrain/ElevationProfile.tsx — 交互式地形剖面图 (Canvas)
//
// 实现（PROJECT_PLAN 第十一节）：
//   纵轴 = 高程（自动 min/max + 10% margin）
//   横轴 = 累计距离
//   渐变填充（海拔着色方案）+ 路径曲线 + 最高/最低点标记
//   鼠标悬停竖线 + 浮动标注 ↔ 地图标记联动

import { useRef, useEffect, useCallback, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { ElevationProfile as EPData, ElevationSample } from '../../core/terrain';
import type { ElevationProfileTool } from '../../tools/elevation-profile.tool';

interface ElevationProfileProps {
  tool: ElevationProfileTool;
  profile: EPData;
}

const CHART_HEIGHT = 200;
const PADDING = { top: 20, right: 16, bottom: 30, left: 50 };

export function ElevationProfileChart({ tool, profile }: ElevationProfileProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mapMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [hoveredSample, setHoveredSample] = useState<ElevationSample | null>(null);

  const validSamples = profile.validSamples;

  // 绘制剖面图
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || validSamples.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = CHART_HEIGHT;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const plotW = w - PADDING.left - PADDING.right;
    const plotH = h - PADDING.top - PADDING.bottom;

    const maxDist = validSamples[validSamples.length - 1].distance;
    const elevations = validSamples.map((s) => s.elevation!);
    const minEl = Math.min(...elevations);
    const maxEl = Math.max(...elevations);
    const elRange = maxEl - minEl || 1;
    const elMargin = elRange * 0.1;
    const yMin = minEl - elMargin;
    const yMax = maxEl + elMargin;
    const yRange = yMax - yMin;

    const toX = (d: number) => PADDING.left + (d / maxDist) * plotW;
    const toY = (el: number) => PADDING.top + plotH - ((el - yMin) / yRange) * plotH;

    ctx.clearRect(0, 0, w, h);

    // 1. 渐变填充
    const gradient = ctx.createLinearGradient(0, PADDING.top, 0, PADDING.top + plotH);
    gradient.addColorStop(0, 'rgba(255, 200, 100, 0.5)');  // 高海拔
    gradient.addColorStop(0.4, 'rgba(180, 140, 60, 0.4)');
    gradient.addColorStop(0.7, 'rgba(100, 160, 80, 0.4)');
    gradient.addColorStop(1, 'rgba(30, 120, 50, 0.5)');    // 低海拔

    ctx.beginPath();
    ctx.moveTo(toX(validSamples[0].distance), toY(yMin));
    for (const s of validSamples) {
      ctx.lineTo(toX(s.distance), toY(s.elevation!));
    }
    ctx.lineTo(toX(validSamples[validSamples.length - 1].distance), toY(yMin));
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // 2. 路径曲线
    ctx.beginPath();
    ctx.moveTo(toX(validSamples[0].distance), toY(validSamples[0].elevation!));
    for (const s of validSamples) {
      ctx.lineTo(toX(s.distance), toY(s.elevation!));
    }
    ctx.strokeStyle = '#ff7043';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. 最高点/最低点标记
    const maxPt = validSamples.reduce((a, b) => (a.elevation! > b.elevation! ? a : b));
    const minPt = validSamples.reduce((a, b) => (a.elevation! < b.elevation! ? a : b));
    drawMarker(ctx, toX(maxPt.distance), toY(maxPt.elevation!), '▲', '#ff5252');
    drawMarker(ctx, toX(minPt.distance), toY(minPt.elevation!), '▼', '#4fc3f7');

    // 4. 坐标轴标签
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    // X 轴
    ctx.fillText('0 km', PADDING.left, h - 4);
    ctx.fillText(`${(maxDist / 1000).toFixed(1)} km`, w - PADDING.right, h - 4);
    // Y 轴
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(yMin)}m`, PADDING.left - 4, toY(yMin));
    ctx.fillText(`${Math.round(maxEl)}m`, PADDING.left - 4, toY(maxEl) + 3);
    ctx.fillText(`${Math.round(yMax)}m`, PADDING.left - 4, PADDING.top + 10);

    // 网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    [yMin, yMax, (yMin + yMax) / 2].forEach((val) => {
      const y = toY(val);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(w - PADDING.right, y);
      ctx.stroke();
    });

    if (hoveredSample && hoveredSample.elevation !== null) {
      const x = toX(hoveredSample.distance);
      const y = toY(hoveredSample.elevation!);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, PADDING.top);
      ctx.lineTo(x, PADDING.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff7043';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '700 10px monospace';
      ctx.textAlign = x > w - 130 ? 'right' : 'left';
      ctx.fillStyle = '#fff';
      ctx.fillText(
        `${(hoveredSample.distance / 1000).toFixed(3)} km / ${hoveredSample.elevation!.toFixed(1)} m`,
        x + (x > w - 130 ? -7 : 7),
        Math.max(PADDING.top + 10, y - 9),
      );
      ctx.restore();
    }
  }, [profile, validSamples, hoveredSample]);

  useEffect(() => {
    tool.setHoverCallback(setHoveredSample);
    return () => tool.setHoverCallback(null);
  }, [tool]);

  // 鼠标悬停
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || validSamples.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    const plotW = canvas.clientWidth - PADDING.left - PADDING.right;
    const maxDist = validSamples[validSamples.length - 1].distance;
    const dist = ((mx - PADDING.left) / plotW) * maxDist;

    // 二分查找最近采样点
    let lo = 0, hi = validSamples.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (validSamples[mid].distance < dist) lo = mid;
      else hi = mid;
    }
    const nearest = validSamples[Math.abs(validSamples[lo].distance - dist) < Math.abs(validSamples[hi].distance - dist) ? lo : hi];
    setHoveredSample(nearest);

    // Tooltip
    if (tooltipRef.current) {
      tooltipRef.current.style.display = 'block';
      tooltipRef.current.style.left = `${e.clientX - rect.left}px`;
      tooltipRef.current.style.top = `${e.clientY - rect.top - 40}px`;
      tooltipRef.current.textContent =
        `${(nearest.distance / 1000).toFixed(2)} km | ${Math.round(nearest.elevation!)} m`;
    }

    // 地图联动标记
    const engine = tool.getEngine();
    if (engine) {
      const map = engine.getNative() as maplibregl.Map;
      if (mapMarkerRef.current) {
        mapMarkerRef.current.setLngLat(nearest.coordinate);
      } else {
        const element = document.createElement('div');
        element.style.cssText = [
          'width:16px',
          'height:16px',
          'border-radius:50%',
          'background:#ff7043',
          'border:2px solid #fff',
          'box-shadow:0 0 0 3px rgba(255,112,67,.3)',
          'pointer-events:none',
        ].join(';');
        mapMarkerRef.current = new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat(nearest.coordinate)
          .addTo(map);
      }
    }
  }, [validSamples, tool]);

  const handleMouseLeave = useCallback(() => {
    setHoveredSample(null);
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    // 清理地图标记
    mapMarkerRef.current?.remove();
    mapMarkerRef.current = null;
  }, [tool]);

  useEffect(() => () => {
    mapMarkerRef.current?.remove();
    mapMarkerRef.current = null;
  }, [tool]);

  if (validSamples.length < 2) {
    return (
      <div style={{ padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center' }}>
        等待 DEM 数据...
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: CHART_HEIGHT, cursor: 'crosshair', borderRadius: 4 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      <div
        ref={tooltipRef}
        style={{
          position: 'absolute', display: 'none',
          background: 'rgba(0,0,0,0.85)', color: '#fff',
          padding: '2px 8px', borderRadius: 4,
          fontSize: 11, fontFamily: 'monospace',
          whiteSpace: 'nowrap', pointerEvents: 'none',
          transform: 'translateX(-50%)',
        }}
      />
    </div>
  );
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  symbol: string,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(symbol, x, y - 8);
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
}
