import type * as maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';

const FILL_COLORS: Record<string, string> = {
  earth: '#eee9df',
  landuse: '#b7d39c',
  water: '#74b6df',
  buildings: '#a69a8b',
};

/** Projected canvas fallback for compact static vector datasets. */
export class GeoJsonCanvasOverlay {
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private readonly map: maplibregl.Map;
  private readonly data: FeatureCollection;
  private readonly renderHandler = () => this.render();

  constructor(map: maplibregl.Map, data: FeatureCollection) {
    this.map = map;
    this.data = data;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable');
    this.context = context;
    Object.assign(this.canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '2',
    });
    this.map.getCanvasContainer().append(this.canvas);
    this.map.on('render', this.renderHandler);
    this.render();
  }

  remove(): void {
    this.map.off('render', this.renderHandler);
    this.canvas.remove();
  }

  private render(): void {
    const width = this.map.getCanvas().clientWidth;
    const height = this.map.getCanvas().clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.context.clearRect(0, 0, width, height);

    for (const layer of ['earth', 'landuse', 'water', 'roads', 'buildings']) {
      for (const feature of this.data.features) {
        if (feature.properties?._layer === layer) this.drawFeature(feature);
      }
    }
  }

  private drawFeature(feature: Feature): void {
    const layer = String(feature.properties?._layer ?? '');
    if (layer === 'roads') {
      this.context.strokeStyle = '#6d655e';
      this.context.lineWidth = Math.max(1, (this.map.getZoom() - 10) * 0.9);
      this.traceLines(feature.geometry);
      this.context.stroke();
      return;
    }

    const fill = FILL_COLORS[layer];
    if (!fill) return;
    this.context.fillStyle = fill;
    this.context.strokeStyle = layer === 'buildings' ? '#81766b' : fill;
    this.context.lineWidth = layer === 'buildings' ? 0.7 : 0.3;
    this.tracePolygons(feature.geometry);
    this.context.fill('evenodd');
    if (layer === 'buildings') this.context.stroke();
  }

  private traceLines(geometry: Geometry): void {
    this.context.beginPath();
    if (geometry.type === 'LineString') this.traceLine(geometry.coordinates);
    if (geometry.type === 'MultiLineString') geometry.coordinates.forEach((line) => this.traceLine(line));
  }

  private tracePolygons(geometry: Geometry): void {
    this.context.beginPath();
    if (geometry.type === 'Polygon') geometry.coordinates.forEach((ring) => this.traceLine(ring, true));
    if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => this.traceLine(ring, true)));
    }
  }

  private traceLine(coordinates: Position[], close = false): void {
    coordinates.forEach((coordinate, index) => {
      const point = this.map.project([coordinate[0], coordinate[1]]);
      if (index === 0) this.context.moveTo(point.x, point.y);
      else this.context.lineTo(point.x, point.y);
    });
    if (close) this.context.closePath();
  }
}
