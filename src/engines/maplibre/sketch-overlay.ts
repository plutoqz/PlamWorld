import type * as maplibregl from 'maplibre-gl';
import type { LngLat } from '../../core/types';

export interface SketchStyle {
  strokeColor: string;
  strokeWidth?: number;
  strokeDash?: string;
  fillColor?: string;
  fillOpacity?: number;
}

/** Lightweight projected SVG overlay for interactive sketches. */
export class MapSketchOverlay {
  private readonly map: maplibregl.Map;
  private readonly svg: SVGSVGElement;
  private readonly shape: SVGPathElement;
  private points: readonly LngLat[] = [];
  private closed = false;
  private style: SketchStyle;
  private readonly renderHandler = () => this.render();

  constructor(map: maplibregl.Map, style: SketchStyle) {
    this.map = map;
    this.style = style;
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    Object.assign(this.svg.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      overflow: 'visible',
      pointerEvents: 'none',
      zIndex: '1',
    });
    this.shape.setAttribute('vector-effect', 'non-scaling-stroke');
    this.shape.setAttribute('stroke-linecap', 'round');
    this.shape.setAttribute('stroke-linejoin', 'round');
    this.svg.append(this.shape);
    this.map.getCanvasContainer().append(this.svg);
    this.map.on('render', this.renderHandler);
    this.applyStyle();
  }

  setCoordinates(points: readonly LngLat[], closed = false): void {
    this.points = points;
    this.closed = closed;
    this.render();
  }

  setStyle(style: SketchStyle): void {
    this.style = style;
    this.applyStyle();
  }

  remove(): void {
    this.map.off('render', this.renderHandler);
    this.svg.remove();
  }

  private render(): void {
    const width = this.map.getCanvas().clientWidth;
    const height = this.map.getCanvas().clientHeight;
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const commands = this.points.map((coordinate, index) => {
      const point = this.map.project({ lng: coordinate[0], lat: coordinate[1] });
      return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    });
    if (this.closed && commands.length >= 3) commands.push('Z');
    this.shape.setAttribute('d', commands.join(' '));
  }

  private applyStyle(): void {
    this.shape.setAttribute('stroke', this.style.strokeColor);
    this.shape.setAttribute('stroke-width', String(this.style.strokeWidth ?? 4));
    this.shape.setAttribute('stroke-dasharray', this.style.strokeDash ?? 'none');
    this.shape.setAttribute('fill', this.style.fillColor ?? 'none');
    this.shape.setAttribute('fill-opacity', String(this.style.fillOpacity ?? 0));
  }
}
