// tools/measure.tool.ts — 距离/面积测量工具 (MapTool)
//
// 交互：单击地图加采集点 → 双击/Enter 完成
// 视觉：MapLibre 原生 Marker（DOM 元素，100% 可见）+ GeoJSON 线/面

import * as maplibregl from 'maplibre-gl';
import { area as turfArea, polygon as turfPolygon } from '@turf/turf';
import type { MapTool, ToolContext } from '../core/tools';
import type { LngLat } from '../core/types';
import { MapSketchOverlay } from '../engines/maplibre/sketch-overlay';

export type MeasureMode = 'distance' | 'area';

export class MeasureTool implements MapTool {
  readonly id = 'measure';
  readonly name = '距离/面积测量';
  readonly icon = '📏';
  readonly category = 'measurement';
  readonly description = '单击加采集点，双击/Enter 完成。≥2 点测距，≥3 点测面积';
  readonly exclusive = true;

  private active = false;
  private finished = false;
  private ctx: ToolContext | null = null;
  private mode: MeasureMode = 'distance';
  private points: LngLat[] = [];
  private sketch: MapSketchOverlay | null = null;
  /** DOM markers (绝对可见) */
  private markers: maplibregl.Marker[] = [];

  private onMapClick: ((e: any) => void) | null = null;
  private onMapDblClick: ((e: any) => void) | null = null;
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;

  activate(ctx: ToolContext): void {
    if (this.active) return;
    this.active = true;
    this.finished = false;
    this.ctx = ctx;
    this.points = [];
    this.sketch = null;
    this.markers = [];

    const map = ctx.engine.getNative() as maplibregl.Map;

    this.onMapClick = (e: any) => {
      if (this.finished) return;
      this._addPoint(e);
    };

    this.onMapDblClick = (e: any) => {
      if (this.finished) return;
      e.preventDefault?.();
      this._finish();
    };

    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); this._finish(); }
      if (e.key === 'Escape') {
        if (this.points.length > 0) {
          this.points.pop();
          this._removeLastMarker();
          this._render();
        }
      }
    };

    map.on('click', this.onMapClick);
    map.on('dblclick', this.onMapDblClick);
    window.addEventListener('keydown', this.onKeyDown);
  }

  deactivate(): void {
    this.active = false;
    const map = this.ctx?.engine.getNative() as any;
    if (map) {
      if (this.onMapClick) map.off('click', this.onMapClick);
      if (this.onMapDblClick) map.off('dblclick', this.onMapDblClick);
    }
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this._clearAll();
    this.points = [];
    this.finished = false;
    this.ctx = null;
  }

  isActive() { return this.active; }
  getPoints() { return this.points; }
  getMode() { return this.mode; }
  isFinished() { return this.finished; }

  setMode(mode: MeasureMode) {
    this.mode = mode;
    this.points = [];
    this.finished = false;
    this._clearAll();
  }

  getDistance(): number | null {
    if (this.points.length < 2) return null;
    let total = 0;
    for (let i = 1; i < this.points.length; i++) {
      total += haversineM(this.points[i - 1], this.points[i]);
    }
    return total;
  }

  getArea(): number | null {
    if (this.points.length < 3) return null;
    return polygonAreaM(this.points);
  }

  reset() {
    this.points = [];
    this.finished = false;
    this._clearAll();
  }

  // ---- internal ----

  private _addPoint(e: any) {
    const pt: LngLat = [e.lngLat.lng, e.lngLat.lat];
    this.points.push(pt);
    // 放置 Marker
    const map = this.ctx?.engine.getNative() as maplibregl.Map;
    if (map) {
      const el = document.createElement('div');
      const idx = this.points.length;
      el.innerHTML = `<div style="
        width:18px;height:18px;border-radius:50%;
        background:${this.finished ? '#00e5ff' : '#ffab40'};
        border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,0.5);
        transform:translate(-50%,-50%);
        display:flex;align-items:center;justify-content:center;
        font-size:9px;color:#fff;font-weight:700;
      ">${idx}</div>`;
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(pt)
        .addTo(map);
      this.markers.push(marker);
    }
    this._render();
  }

  private _finish() {
    if (this.points.length < (this.mode === 'area' ? 3 : 2)) return;
    this.finished = true;
    // 重建 markers（改为完成态颜色）
    this._clearMarkers();
    const map = this.ctx?.engine.getNative() as maplibregl.Map;
    if (map) {
      this.points.forEach((pt, i) => {
        const el = document.createElement('div');
        el.innerHTML = `<div style="
          width:18px;height:18px;border-radius:50%;
          background:#00e5ff;border:3px solid #fff;
          box-shadow:0 0 6px rgba(0,0,0,0.5);
          transform:translate(-50%,-50%);
          display:flex;align-items:center;justify-content:center;
          font-size:9px;color:#000;font-weight:700;
        ">${i + 1}</div>`;
        this.markers.push(
          new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat(pt)
            .addTo(map),
        );
      });
    }
    this._render();
  }

  private _render() {
    if (!this.ctx || this.points.length < 2) return;
    this._clearLayer();

    const color = this.finished ? '#00e5ff' : '#ffab40';
    const isPolygon = this.mode === 'area' && this.points.length >= 3;

    if (!this.sketch) {
      const map = this.ctx.engine.getNative() as maplibregl.Map;
      this.sketch = new MapSketchOverlay(map, {
        strokeColor: color,
        strokeWidth: 4,
        strokeDash: this.finished ? undefined : '10 6',
        fillColor: isPolygon ? color : undefined,
        fillOpacity: isPolygon ? 0.18 : 0,
      });
    } else {
      this.sketch.setStyle({
        strokeColor: color,
        strokeWidth: 4,
        strokeDash: this.finished ? undefined : '10 6',
        fillColor: isPolygon ? color : undefined,
        fillOpacity: isPolygon ? 0.18 : 0,
      });
    }
    this.sketch.setCoordinates(this.points, isPolygon);
  }

  private _clearLayer() {
    this.sketch?.remove();
    this.sketch = null;
  }

  private _clearMarkers() {
    this.markers.forEach((m) => m.remove());
    this.markers = [];
  }

  private _removeLastMarker() {
    const m = this.markers.pop();
    m?.remove();
  }

  private _clearAll() {
    this._clearLayer();
    this._clearMarkers();
  }
}

// ---- 地理计算 ----

function haversineM(a: LngLat, b: LngLat): number {
  const R = 6_371_000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const sDLat = Math.sin(dLat / 2), sDLng = Math.sin(dLng / 2);
  const aVal = sDLat * sDLat + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * sDLng * sDLng;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

function polygonAreaM(ring: LngLat[]): number {
  const closedRing = [...ring, ring[0]];
  return turfArea(turfPolygon([closedRing]));
}
