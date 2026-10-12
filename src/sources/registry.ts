// sources/registry.ts — 图源注册表

import type { ITileSource } from '../core/source';
import { googleSatellite } from './google-satellite';
import { osmRaster } from './osm-raster';
import { openTopo } from './open-topo';
import { pmtilesSource } from './pmtiles';
import { esriSatellite } from './esri-satellite';
import { osmLiberty } from './osm-liberty';

const BUILTIN_SOURCES: ITileSource[] = [esriSatellite, osmRaster, openTopo, googleSatellite, pmtilesSource, osmLiberty];

class SourceRegistry {
  private sources = new Map<string, ITileSource>();
  private activeId: string;

  constructor() {
    BUILTIN_SOURCES.forEach((s) => this.register(s));
    this.activeId = esriSatellite.id;
  }

  register(source: ITileSource): void {
    this.sources.set(source.id, source);
  }

  get(sourceId: string): ITileSource | undefined {
    if (this.sources.has(sourceId)) return this.sources.get(sourceId);
    return this.list().find((s) => s.category === sourceId);
  }

  getActive(): ITileSource {
    return this.sources.get(this.activeId) ?? esriSatellite;
  }

  setActive(sourceId: string): ITileSource | undefined {
    const source = this.get(sourceId);
    if (source) this.activeId = source.id;
    return source;
  }

  list(): ITileSource[] {
    return Array.from(this.sources.values());
  }

  listByCategory(category: string): ITileSource[] {
    return this.list().filter((s) => s.category === category);
  }
}

export const sourceRegistry = new SourceRegistry();
