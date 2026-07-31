// components/visual/ProjectionView.tsx — D3 投影切换 Canvas 图层
//
// 独立 Canvas 覆盖在地图上，用 d3-geo 渲染世界国家轮廓。
// Orthographic 模式：隐藏 MapLibre，纯 Canvas 地球仪 + 拖拽旋转
// 其余模式：透明显叠加

import { useRef, useEffect, useCallback } from 'react';
import {
  geoMercator,
  geoOrthographic,
  geoEqualEarth,
  geoNaturalEarth1,
  geoPath,
  type GeoProjection,
} from 'd3-geo';
import type { FeatureCollection } from 'geojson';
import type { ProjectionType } from '@tools/projection-switch.tool';

// Natural Earth 110m 国家边界（内联引入以避免额外 HTTP 请求）
import countriesData from '../../data/boundaries/countries-110m.json';

interface ProjectionViewProps {
  projection: ProjectionType;
  rotation: [number, number, number];
  width: number;
  height: number;
  onRotationChange?: (r: [number, number, number]) => void;
  /** 是否正交投影模式（隐藏底图，显示蓝色背景） */
}

export function ProjectionView({
  projection,
  rotation,
  width,
  height,
  onRotationChange,
}: ProjectionViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isGlobe = projection === 'orthographic';
  const dragging = useRef(false);
  const lastPos = useRef<[number, number]>([0, 0]);
  const currentRotation = useRef(rotation);

  // sync external rotation
  useEffect(() => {
    currentRotation.current = rotation;
  }, [rotation]);

  const renderProjection = useCallback(
    (proj: GeoProjection, ctx: CanvasRenderingContext2D) => {
      const pathGen = geoPath(proj, ctx);
      const fc = countriesData as unknown as FeatureCollection;

      ctx.clearRect(0, 0, width, height);

      // Globe mode: blue ocean background
      if (isGlobe) {
        ctx.fillStyle = '#1a3a5c';
        ctx.fillRect(0, 0, width, height);

        // Draw globe circle clip
        const cx = width / 2;
        const cy = height / 2;
        const r = Math.min(width, height) / 2 - 4;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();

        // Ocean fill
        ctx.fillStyle = '#1e5799';
        ctx.fillRect(0, 0, width, height);

        // Graticule
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5;
        const graticuleProj = proj;
        for (let lat = -80; lat <= 80; lat += 20) {
          for (let lng = -180; lng <= 180; lng += 20) {
            const p = graticuleProj([lng, lat]);
            if (p) {
              ctx.beginPath();
              ctx.arc(p[0], p[1], 1, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255,255,255,0.08)';
              ctx.fill();
            }
          }
        }

        // Countries
        ctx.fillStyle = '#3a7d44';
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 0.5;
        for (const feature of fc.features) {
          ctx.beginPath();
          pathGen(feature);
          ctx.fill();
          ctx.stroke();
        }

        // Globe outline
        ctx.restore();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // Flat projections replace the Web Mercator map instead of ghosting over it.
        ctx.fillStyle = '#15334a';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#5f8958';
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 0.7;

        for (const feature of fc.features) {
          ctx.beginPath();
          pathGen(feature);
          ctx.fill();
          ctx.stroke();
        }

        // Graticule
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.3;
        for (let lat = -80; lat <= 80; lat += 20) {
          for (let lng = -180; lng <= 180; lng += 20) {
            const p = proj([lng, lat]);
            if (p) {
              ctx.beginPath();
              ctx.arc(p[0], p[1], 0.8, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255,255,255,0.05)';
              ctx.fill();
            }
          }
        }
      }
    },
    [width, height, isGlobe],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = Math.min(width, height);

    let proj: GeoProjection;
    switch (projection) {
      case 'orthographic':
        proj = geoOrthographic()
          .scale(scale / 2.3)
          .translate([width / 2, height / 2])
          .rotate(currentRotation.current)
          .precision(0.1);
        break;
      case 'equal-earth':
        proj = geoEqualEarth()
          .scale(scale / 5.5)
          .translate([width / 2, height / 2])
          .precision(0.1);
        break;
      case 'natural-earth':
        proj = geoNaturalEarth1()
          .scale(scale / 5.5)
          .translate([width / 2, height / 2])
          .precision(0.1);
        break;
      default:
        proj = geoMercator()
          .scale(scale / 5.7)
          .translate([width / 2, height / 2])
          .precision(0.1);
    }

    renderProjection(proj, ctx);
  }, [projection, rotation, width, height, renderProjection]);

  // ---- drag handling (globe rotation) ----
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isGlobe) return;
      dragging.current = true;
      lastPos.current = [e.clientX, e.clientY];
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [isGlobe],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current || !isGlobe) return;
      const dx = e.clientX - lastPos.current[0];
      const dy = e.clientY - lastPos.current[1];
      lastPos.current = [e.clientX, e.clientY];

      const sensitivity = 0.25;
      const [lambda, phi, gamma] = currentRotation.current;
      const newRotation: [number, number, number] = [
        lambda + dx * sensitivity,
        phi - dy * sensitivity,
        gamma,
      ];
      currentRotation.current = newRotation;
      onRotationChange?.(newRotation);

      // Immediate re-render
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const scale = Math.min(width, height);
      const proj = geoOrthographic()
        .scale(scale / 2.3)
        .translate([width / 2, height / 2])
        .rotate(newRotation)
        .precision(0.1);
      renderProjection(proj, ctx);
    },
    [isGlobe, width, height, onRotationChange, renderProjection],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = false;
      if (isGlobe) (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [isGlobe],
  );

  if (projection === 'mercator') return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1000,
        pointerEvents: isGlobe ? 'auto' : 'none',
        cursor: isGlobe ? 'grab' : 'default',
        display: 'block',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}
