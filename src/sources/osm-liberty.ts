// sources/osm-liberty.ts — OSM Liberty 开源矢量瓦片样式

import type { EngineKind } from '../core/types';
import type { ITileSource } from '../core/source';

/** MapLibre 专属：使用开源 OSM Liberty 矢量样式 */
export const osmLiberty: ITileSource = {
  id: 'osm-liberty',
  name: 'OSM 导航地图',
  type: 'vector',
  category: 'navigation',
  // 使用 demotiles 作为占位，实际部署时可替换为本地 style.json 或 Protomaps
  tileUrl: 'https://demotiles.maplibre.org/style.json',
  attribution: '© OpenStreetMap contributors',
  minZoom: 0,
  maxZoom: 20,

  toEngineConfig(kind: EngineKind) {
    if (kind === 'maplibre') {
      // 直接返回样式 URL — MapLibre 支持 style URL 加载
      return this.tileUrl;
    }
    throw new Error(`OSM Liberty: 不支持的引擎 ${kind}`);
  },
};
