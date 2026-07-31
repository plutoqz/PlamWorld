// engines/maplibre/adapter.ts — MapLibre GL JS 引擎适配器

import * as maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type {
  IMapEngine,
  MapEngineOptions,
  FlyToOptions,
  FitBoundsOptions,
  CaptureOptions,
  LayerStyle,
  MapEvent,
  MapEventHandler,
} from '../../core/engine';
import type { LngLat, LngLatBounds, EngineKind } from '../../core/types';
import type { ITileSource } from '../../core/source';
import { GeoJsonCanvasOverlay } from './geojson-canvas-overlay';

const DEBUG = true;
const log = (...args: unknown[]) => DEBUG && console.log('[MapLibreAdapter]', ...args);

export class MapLibreAdapter implements IMapEngine {
  readonly kind: EngineKind = 'maplibre';
  private map: maplibregl.Map | null = null;
  private layerIdCounter = 0;
  private overlays = new Map<string, { data: FeatureCollection; style?: LayerStyle }>();
  private sourcePreview: GeoJsonCanvasOverlay | null = null;

  mount(options: MapEngineOptions): void {
    if (this.map) this.destroy();

    log('mount() called', { center: options.center, zoom: options.zoom });

    const mapOptions: maplibregl.MapOptions = {
      container: options.container,
      center: options.center,
      zoom: options.zoom,
      pitch: options.pitch ?? 0,
      bearing: options.bearing ?? 0,
    };

    // MapLibre v6 does not fire `load` when style is omitted.
    mapOptions.style = options.style as maplibregl.StyleSpecification | string;
    log('style provided:', typeof options.style === 'string' ? options.style : 'StyleSpec');

    this.map = new maplibregl.Map(mapOptions);
    log('Map instance created');
    this.map.on('error', (event) => {
      console.error('[MapLibreAdapter] map error:', event.error?.message ?? event.error);
    });

    // v6: 用 once 绑定 load，避免 StrictMode 双重 mount 重复绑定
    this.map.once('load', () => {
      log('✅ load event fired');
    });
  }

  destroy(): void {
    log('destroy()');
    this.sourcePreview?.remove();
    this.sourcePreview = null;
    this.map?.remove();
    this.map = null;
    this.overlays.clear();
  }

  isMounted(): boolean {
    return this.map !== null;
  }

  flyTo(center: LngLat, zoom?: number, options?: FlyToOptions): void {
    this.map?.flyTo({ center, zoom, ...options });
  }

  setPitch(pitch: number): void {
    this.map?.setPitch(pitch);
  }

  setBearing(bearing: number): void {
    this.map?.setBearing(bearing);
  }

  fitBounds(bounds: LngLatBounds, options?: FitBoundsOptions): void {
    this.map?.fitBounds(bounds, options);
  }

  setTileSource(source: ITileSource): void {
    if (!this.map) return;
    this.sourcePreview?.remove();
    this.sourcePreview = null;
    const config = source.toEngineConfig('maplibre');
    if (source.bounds) {
      this.map.fitBounds(source.bounds, {
        padding: 48,
        maxZoom: source.maxZoom,
        duration: 0,
      });
    }
    this.map.once('style.load', () => {
      this.restoreOverlays();
      if (this.map && source.previewData) {
        this.sourcePreview = new GeoJsonCanvasOverlay(this.map, source.previewData);
      }
      const nativeMap = this.map;
      if (nativeMap) {
        const style = nativeMap.getStyle();
        log(
          'style loaded:',
          JSON.stringify({
            source: source.id,
            sources: Object.keys(style.sources),
            layers: style.layers.map((layer) => layer.id),
          }),
        );
        nativeMap.once('idle', () => {
          log(
            'style idle:',
            JSON.stringify({
              source: source.id,
              loaded: Object.keys(style.sources).every((sourceId) =>
                nativeMap.isSourceLoaded(sourceId),
              ),
              renderedFeatures: nativeMap.queryRenderedFeatures().length,
            }),
          );
        });
      }
    });
    this.map.setStyle(
      typeof config === 'string' ? config : (config as maplibregl.StyleSpecification),
    );
  }

  addGeoJsonLayer(data: FeatureCollection, style?: LayerStyle): string {
    if (!this.map) {
      console.warn('[MapLibreAdapter] addGeoJsonLayer: map 未挂载，跳过');
      return '';
    }
    const layerId = `palm-layer-${++this.layerIdCounter}`;
    this.overlays.set(layerId, { data, style });
    this.addOverlayToMap(layerId, data, style);
    return layerId;
  }

  updateGeoJsonLayer(layerId: string, data: FeatureCollection): void {
    const overlay = this.overlays.get(layerId);
    if (!overlay || !this.map) return;
    overlay.data = data;

    const source = this.map.getSource(`${layerId}-src`) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
    } else {
      this.addOverlayToMap(layerId, data, overlay.style);
    }
  }

  removeLayer(layerId: string): void {
    if (!this.map) return;
    this.overlays.delete(layerId);
    const sourceId = `${layerId}-src`;
    if (this.map.getLayer(`${layerId}-fill`)) this.map.removeLayer(`${layerId}-fill`);
    if (this.map.getLayer(`${layerId}-line`)) this.map.removeLayer(`${layerId}-line`);
    if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);
  }

  private restoreOverlays(): void {
    for (const [layerId, overlay] of this.overlays) {
      this.addOverlayToMap(layerId, overlay.data, overlay.style);
    }
  }

  private addOverlayToMap(layerId: string, data: FeatureCollection, style?: LayerStyle): void {
    if (!this.map || this.map.getSource(`${layerId}-src`)) return;

    const sourceId = `${layerId}-src`;
    const hasLineGeometry = data.features.some(
      (feature) =>
        feature.geometry.type === 'LineString' ||
        feature.geometry.type === 'MultiLineString' ||
        feature.geometry.type === 'Polygon' ||
        feature.geometry.type === 'MultiPolygon',
    );
    if (!hasLineGeometry) return;

    log(`render overlay ${layerId}:`, data.features.map((f) => f.geometry.type).join(','));
    this.map.addSource(sourceId, { type: 'geojson', data });

    // Both layers are created up front because an area measurement starts as a line.
    if (style?.fillColor) {
      const fillPaint: maplibregl.FillLayerSpecification['paint'] = {
        'fill-color': style.fillColor,
        'fill-opacity': style.fillOpacity ?? 0.3,
      };
      if (style.strokeColor) fillPaint['fill-outline-color'] = style.strokeColor;
      this.map.addLayer({
        id: `${layerId}-fill`,
        source: sourceId,
        type: 'fill',
        paint: fillPaint,
      });
    }

    this.map.addLayer({
      id: `${layerId}-line`,
      source: sourceId,
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'visible' },
      paint: {
        'line-color': style?.strokeColor ?? '#ff4488',
        'line-width': style?.strokeWidth ?? 4,
        'line-opacity': 1,
        ...(style?.strokeDash ? { 'line-dasharray': style.strokeDash } : {}),
      },
    });
    this.map.triggerRepaint();
  }

  on(event: MapEvent, handler: MapEventHandler): void {
    this.map?.on(event, handler);
  }

  off(event: MapEvent, handler: MapEventHandler): void {
    this.map?.off(event, handler);
  }

  getCenter(): LngLat {
    const c = this.map?.getCenter();
    return c ? [c.lng, c.lat] : [0, 0];
  }

  getZoom(): number {
    return this.map?.getZoom() ?? 0;
  }

  getBounds(): LngLatBounds {
    const b = this.map?.getBounds();
    if (!b)
      return [
        [0, 0],
        [0, 0],
      ];
    return [
      [b.getWest(), b.getSouth()],
      [b.getEast(), b.getNorth()],
    ];
  }

  queryElevation(lngLat: LngLat): number | null {
    if (!this.map) return null;
    const el = this.map.queryTerrainElevation({ lng: lngLat[0], lat: lngLat[1] });
    return el ?? null;
  }

  async captureViewport(_options?: CaptureOptions): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = this.map?.getCanvas();
      if (!canvas) return reject(new Error('Map canvas not available'));
      canvas.toBlob((blob: Blob | null) => {
        if (blob) resolve(blob);
        else reject(new Error('toBlob failed'));
      }, 'image/png');
    });
  }

  getNative(): unknown {
    return this.map;
  }
}
