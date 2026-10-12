// sources/pmtiles.ts — PMTiles 矢量瓦片图源
// 使用 Protomaps 公开 PMTiles 服务，通过 HTTP Range Request 按需加载

import { type ITileSource, type TileSourceType, type TileSourceCategory } from '../core/source';
import type { EngineKind } from '../core/types';
import type { FeatureCollection } from 'geojson';
import firenzeData from '../data/firenze.json';

export const PMTILES_ARCHIVE_URL = '/data/firenze.pmtiles';
export const PMTILES_DEMO_BOUNDS: [[number, number], [number, number]] = [
  [11.247253, 43.705608],
  [11.340637, 43.773077],
];

export function getPMTilesProtocolUrl(): string {
  const base = typeof window !== 'undefined' ? window.location.href : 'http://localhost';
  const archiveUrl = new URL(PMTILES_ARCHIVE_URL, base).href;
  return `pmtiles://${archiveUrl}`;
}

export const PMTILES_GEOJSON = firenzeData as unknown as FeatureCollection;

export const pmtilesSource: ITileSource = {
  id: 'pmtiles',
  name: 'PMTiles 矢量（佛罗伦萨示例）',
  type: 'vector' as TileSourceType,
  category: 'navigation' as TileSourceCategory,
  tileUrl: PMTILES_ARCHIVE_URL,
  attribution: '© OpenStreetMap contributors · Protomaps',
  minZoom: 0,
  maxZoom: 15,
  bounds: PMTILES_DEMO_BOUNDS,
  previewData: PMTILES_GEOJSON,

  toEngineConfig(_kind: EngineKind) {
    const pmtilesUrl = getPMTilesProtocolUrl();
    return {
      version: 8,
      sources: {
        protomaps: {
          type: 'vector',
          url: pmtilesUrl,
          attribution: '© OpenStreetMap contributors · Protomaps',
        },
      },
      layers: [
        {
          id: 'pmtiles-background',
          type: 'background',
          paint: { 'background-color': '#eef2f5' },
        },
        {
          id: 'pmtiles-earth',
          source: 'protomaps',
          'source-layer': 'earth',
          type: 'fill',
          paint: { 'fill-color': '#e8ecef' },
        },
        {
          id: 'pmtiles-landuse',
          source: 'protomaps',
          'source-layer': 'landuse',
          type: 'fill',
          paint: { 'fill-color': '#e1ebd6', 'fill-opacity': 0.8 },
        },
        {
          id: 'pmtiles-water',
          source: 'protomaps',
          'source-layer': 'water',
          type: 'fill',
          paint: { 'fill-color': '#a5bfdd' },
        },
        {
          id: 'pmtiles-buildings',
          source: 'protomaps',
          'source-layer': 'buildings',
          type: 'fill',
          paint: { 'fill-color': '#d9d0c7', 'fill-outline-color': '#b3a99f' },
        },
        {
          id: 'pmtiles-roads',
          source: 'protomaps',
          'source-layer': 'roads',
          type: 'line',
          paint: { 'line-color': '#ffffff', 'line-width': 2 },
        },
      ],
    };
  },
};
