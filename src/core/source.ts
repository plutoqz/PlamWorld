// core/source.ts — 瓦片图源抽象接口 (含时间维度预留)

import type { EngineKind, LngLatBounds } from './types';
import type { FeatureCollection } from 'geojson';

// ---- 图源分类 ----

export type TileSourceType = 'raster' | 'vector' | 'terrain';
export type TileSourceCategory = 'satellite' | 'navigation' | 'topo' | 'custom';

// ---- 图源接口 ----

export interface ITileSource {
  readonly id: string;
  readonly name: string;
  readonly type: TileSourceType;
  readonly category: TileSourceCategory;
  /** 时间维度预留 — v0.4 时空穿梭使用 */
  readonly year?: number;
  readonly tileUrl: string | string[];
  readonly attribution: string;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly tileSize?: number;       // 默认 256
  readonly apiKey?: string;         // 未来需要 key 的图源
  /** 有限覆盖图源的数据范围，切换时引擎会自动定位。 */
  readonly bounds?: LngLatBounds;
  /** 可选的静态矢量预览，供不支持矢量 worker 的环境使用。 */
  readonly previewData?: FeatureCollection;

  /** 转为引擎特定格式的 style/url 配置 */
  toEngineConfig(engineKind: EngineKind): unknown;
}
