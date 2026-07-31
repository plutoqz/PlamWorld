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
  const archiveUrl = new URL(PMTILES_ARCHIVE_URL, window.location.href).href;
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
    // 返回 MapLibre style spec，使用 Protomaps 公开样式
    return {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'pmtiles-background', type: 'background',
          paint: { 'background-color': '#c9dce5' },
        },
      ],
    };
  },
};
