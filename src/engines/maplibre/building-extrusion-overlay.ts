import type * as maplibregl from 'maplibre-gl';
import type { FeatureCollection, Polygon, Position } from 'geojson';

export class BuildingExtrusionOverlay {
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
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '3',
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

    const pitchFactor = Math.max(0.25, this.map.getPitch() / 60);
    const zoomFactor = Math.max(0.65, this.map.getZoom() - 12.5);
    for (const feature of this.data.features) {
      if (feature.properties?._layer !== 'buildings') continue;
      const rawHeight = Number(feature.properties?.height ?? 14);
      const extrusion = Math.min(55, Math.max(7, rawHeight * 0.42 * pitchFactor * zoomFactor));
      const geometry = feature.geometry;
      if (geometry.type === 'Polygon') this.drawPolygon(geometry, extrusion);
      if (geometry.type === 'MultiPolygon') {
        geometry.coordinates.forEach((coordinates) =>
          this.drawPolygon({ type: 'Polygon', coordinates } as Polygon, extrusion),
        );
      }
    }
  }

  private drawPolygon(polygon: Polygon, extrusion: number): void {
    const outer = polygon.coordinates[0];
    if (!outer || outer.length < 3) return;
    const base = outer.map((coordinate) => this.project(coordinate));

    this.context.fillStyle = 'rgba(91, 82, 74, 0.92)';
    for (let index = 1; index < base.length; index++) {
      const previous = base[index - 1];
      const current = base[index];
      this.context.beginPath();
      this.context.moveTo(previous.x, previous.y);
      this.context.lineTo(current.x, current.y);
      this.context.lineTo(current.x, current.y - extrusion);
      this.context.lineTo(previous.x, previous.y - extrusion);
      this.context.closePath();
      this.context.fill();
    }

    this.context.beginPath();
    polygon.coordinates.forEach((ring) => {
      ring.forEach((coordinate, index) => {
        const point = this.project(coordinate);
        if (index === 0) this.context.moveTo(point.x, point.y - extrusion);
        else this.context.lineTo(point.x, point.y - extrusion);
      });
      this.context.closePath();
    });
    this.context.fillStyle = '#d8c7b5';
    this.context.strokeStyle = '#fff4e8';
    this.context.lineWidth = 1;
    this.context.fill('evenodd');
    this.context.stroke();
  }

  private project(coordinate: Position): maplibregl.Point {
    return this.map.project([coordinate[0], coordinate[1]]);
  }
}
