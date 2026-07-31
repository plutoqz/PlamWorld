// tools/elevation-profile.tool.ts — 地形剖线工具 (MapTool)
//
// 交互：单击地图放置途经点 → 双击/Enter 完成 → DEM 采样 → 剖面图
// 视觉：MapLibre 原生 Marker（编号圆点，100% 可见）+ GeoJSON 线

import * as maplibregl from 'maplibre-gl';
import type { MapTool, ToolContext } from '../core/tools';
import type { LngLat } from '../core/types';
import type { ElevationProfile, ElevationSample } from '../core/terrain';
import { generateSamplePoints, buildProfile, haversineDistance } from '../core/terrain';
import { queryElevations } from '../engines/elevation-api';
import { MapSketchOverlay } from '../engines/maplibre/sketch-overlay';

export class ElevationProfileTool implements MapTool {
  readonly id = 'profile';
  readonly name = '地形剖线';
  readonly icon = '📈';
  readonly category = 'measurement';
  readonly description = '单击加点 → 双击/Enter 采样 → 剖面图';
  readonly exclusive = true;

  private active = false;
  private finished = false;
  private sampling = false;
  private ctx: ToolContext | null = null;
  private waypoints: LngLat[] = [];
  private profile: ElevationProfile | null = null;
  private sketch: MapSketchOverlay | null = null;
  private markers: maplibregl.Marker[] = [];
  private extremaMarkers: maplibregl.Marker[] = [];
  private samplingProgress = 0;
  private abortController: AbortController | null = null;

  // 回调
  private onProfileReady: ((profile: ElevationProfile) => void) | null = null;
  private onWaypointsChange: ((pts: LngLat[]) => void) | null = null;
  private onSamplingChange: ((sampling: boolean, progress: number) => void) | null = null;
  private onError: ((message: string | null) => void) | null = null;
  private onHoverSample: ((sample: ElevationSample | null) => void) | null = null;

  private onMapClick: ((e: any) => void) | null = null;
  private onMapDblClick: ((e: any) => void) | null = null;
  private onMapMouseMove: ((e: maplibregl.MapMouseEvent) => void) | null = null;
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;

  // ---- callbacks ----

  setCallbacks(cbs: {
    onProfileReady?: (profile: ElevationProfile) => void;
    onWaypointsChange?: (pts: LngLat[]) => void;
    onSamplingChange?: (sampling: boolean, progress: number) => void;
    onError?: (message: string | null) => void;
  }): void {
    if (cbs.onProfileReady) this.onProfileReady = cbs.onProfileReady;
    if (cbs.onWaypointsChange) this.onWaypointsChange = cbs.onWaypointsChange;
    if (cbs.onSamplingChange) this.onSamplingChange = cbs.onSamplingChange;
    if (cbs.onError) this.onError = cbs.onError;
  }

  setHoverCallback(cb: ((sample: ElevationSample | null) => void) | null): void {
    this.onHoverSample = cb;
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    if (this.active) return;
    this.active = true;
    this.finished = false;
    this.sampling = false;
    this.ctx = ctx;
    this.waypoints = [];
    this.profile = null;
    this.markers = [];
    this.samplingProgress = 0;
    this.abortController = null;

    const map = ctx.engine.getNative() as maplibregl.Map;

    this.onMapClick = (e: any) => {
      if (this.finished || this.sampling) return;
      this._addPoint(e);
    };

    this.onMapDblClick = (e: any) => {
      if (this.finished || this.sampling) return;
      e.preventDefault?.();
      if (this.waypoints.length < 2) return;
      this._startSampling();
    };

    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.waypoints.length >= 2) this._startSampling();
      }
      if (e.key === 'Escape') {
        if (this.sampling) return;
        if (this.waypoints.length > 0) {
          this.waypoints.pop();
          this._removeLastMarker();
          this.onWaypointsChange?.(this.waypoints);
          this._render();
        }
      }
    };

    this.onMapMouseMove = (e: maplibregl.MapMouseEvent) => {
      const samples = this.profile?.validSamples;
      if (!samples?.length) return;

      let nearest: ElevationSample | null = null;
      let nearestDistance = 14;
      for (const sample of samples) {
        const projected = map.project(sample.coordinate);
        const distance = Math.hypot(projected.x - e.point.x, projected.y - e.point.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = sample;
        }
      }
      this.onHoverSample?.(nearest);
      map.getCanvas().style.cursor = nearest ? 'crosshair' : '';
    };

    map.on('click', this.onMapClick);
    map.on('dblclick', this.onMapDblClick);
    map.on('mousemove', this.onMapMouseMove);
    window.addEventListener('keydown', this.onKeyDown);
  }

  deactivate(): void {
    this.active = false;
    this.abortController?.abort();
    this.abortController = null;
    const map = this.ctx?.engine.getNative() as any;
    if (map) {
      if (this.onMapClick) map.off('click', this.onMapClick);
      if (this.onMapDblClick) map.off('dblclick', this.onMapDblClick);
      if (this.onMapMouseMove) map.off('mousemove', this.onMapMouseMove);
      map.getCanvas().style.cursor = '';
    }
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this._clearAll();
    this.waypoints = [];
    this.profile = null;
    this.finished = false;
    this.sampling = false;
    this.ctx = null;
    this.onHoverSample = null;
  }

  isActive() { return this.active; }
  getWaypoints() { return this.waypoints; }
  getProfile() { return this.profile; }
  isFinished() { return this.finished; }
  isSampling() { return this.sampling; }
  getSamplingProgress() { return this.samplingProgress; }
  getEngine() { return this.ctx?.engine ?? null; }

  // ---- DEM 采样 ----

  private async _startSampling() {
    this.finished = true;
    this.sampling = true;
    this.samplingProgress = 0;
    this.onSamplingChange?.(true, 0);
    this.onError?.(null);

    const engine = this.ctx?.engine;
    if (!engine) return;

    const map = engine.getNative() as maplibregl.Map;
    const controller = new AbortController();
    this.abortController = controller;

    try {
      const profile = await this._sampleElevations(controller.signal);
      if (!this.active || controller.signal.aborted) return;
      this.profile = profile;
      this.onProfileReady?.(profile);

      // 重建 markers（完成态颜色）
      this._clearMarkers();
      this._placeMarkers(map);
      this._placeExtremaMarkers(map, profile);
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : '未知错误';
      console.warn('[Profile] 采样异常:', err);
      this.finished = false;
      this.onError?.(`剖面采样失败：${message}`);
    } finally {
      if (this.abortController === controller) this.abortController = null;
      this.sampling = false;
      this.onSamplingChange?.(false, this.profile ? 100 : 0);
    }
  }

  private async _sampleElevations(signal: AbortSignal): Promise<ElevationProfile> {
    const totalDistance = this.waypoints.slice(1).reduce(
      (total, point, index) => total + haversineDistance(this.waypoints[index], point),
      0,
    );
    const intervalM = Math.max(30, totalDistance / 399);
    const samplePoints = generateSamplePoints(this.waypoints, intervalM);
    const elevations = await queryElevations(samplePoints, {
      signal,
      resolutionMeters: intervalM,
      onProgress: (completed, total) => {
        this.samplingProgress = Math.round((completed / total) * 100);
        this.onSamplingChange?.(true, this.samplingProgress);
      },
    });

    return buildProfile(samplePoints, elevations);
  }

  // ---- 视觉 ----

  private _addPoint(e: any) {
    const pt: LngLat = [e.lngLat.lng, e.lngLat.lat];
    this.waypoints.push(pt);
    this.onWaypointsChange?.(this.waypoints);

    const map = this.ctx?.engine.getNative() as maplibregl.Map;
    if (map) {
      const idx = this.waypoints.length;
      const el = document.createElement('div');
      el.innerHTML = `<div style="
        width:20px;height:20px;border-radius:50%;
        background:#ff7043;border:3px solid #fff;
        box-shadow:0 0 8px rgba(0,0,0,0.6);
        transform:translate(-50%,-50%);
        display:flex;align-items:center;justify-content:center;
        font-size:10px;color:#fff;font-weight:700;font-family:sans-serif;
      ">${idx}</div>`;
      this.markers.push(
        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(pt)
          .addTo(map),
      );
    }

    this._render();
  }

  private _placeMarkers(map: maplibregl.Map) {
    const color = '#00bfa5'; // 完成态
    this.waypoints.forEach((pt, i) => {
      const el = document.createElement('div');
      el.innerHTML = `<div style="
        width:20px;height:20px;border-radius:50%;
        background:${color};border:3px solid #fff;
        box-shadow:0 0 8px rgba(0,0,0,0.6);
        transform:translate(-50%,-50%);
        display:flex;align-items:center;justify-content:center;
        font-size:10px;color:#fff;font-weight:700;font-family:sans-serif;
      ">${i + 1}</div>`;
      this.markers.push(
        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(pt)
          .addTo(map),
      );
    });
  }

  private _placeExtremaMarkers(map: maplibregl.Map, profile: ElevationProfile) {
    this._clearExtremaMarkers();
    if (profile.validSamples.length === 0) return;

    const highest = profile.validSamples.reduce((a, b) =>
      a.elevation! >= b.elevation! ? a : b,
    );
    const lowest = profile.validSamples.reduce((a, b) =>
      a.elevation! <= b.elevation! ? a : b,
    );

    this.extremaMarkers = [
      createExtremaMarker(map, highest, '最高点', '#ef4444'),
      createExtremaMarker(map, lowest, '最低点', '#3b82f6'),
    ];
  }

  private _render() {
    if (!this.ctx || this.waypoints.length < 2) return;
    if (!this.sketch) {
      const map = this.ctx.engine.getNative() as maplibregl.Map;
      this.sketch = new MapSketchOverlay(map, {
        strokeColor: '#ff7043',
        strokeWidth: 4,
        strokeDash: '12 6',
      });
    }
    this.sketch.setCoordinates(this.waypoints);
  }

  private _clearLayer() {
    this.sketch?.remove();
    this.sketch = null;
  }

  private _clearMarkers() {
    this.markers.forEach((m) => m.remove());
    this.markers = [];
  }

  private _clearExtremaMarkers() {
    this.extremaMarkers.forEach((marker) => marker.remove());
    this.extremaMarkers = [];
  }

  private _removeLastMarker() {
    const m = this.markers.pop();
    m?.remove();
  }

  private _clearAll() {
    this._clearLayer();
    this._clearMarkers();
    this._clearExtremaMarkers();
  }
}

function createExtremaMarker(
  map: maplibregl.Map,
  sample: ElevationSample,
  label: string,
  color: string,
): maplibregl.Marker {
  const element = document.createElement('div');
  element.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:5px',
    'padding:4px 7px',
    'border-radius:4px',
    `background:${color}`,
    'border:2px solid #fff',
    'box-shadow:0 2px 8px rgba(0,0,0,.55)',
    'color:#fff',
    'font:700 11px sans-serif',
    'white-space:nowrap',
    'pointer-events:none',
  ].join(';');
  element.textContent = `${label} ${sample.elevation!.toFixed(1)} m`;
  return new maplibregl.Marker({ element, anchor: 'bottom', offset: [0, -7] })
    .setLngLat(sample.coordinate)
    .addTo(map);
}
