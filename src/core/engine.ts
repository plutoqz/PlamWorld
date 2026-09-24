// core/engine.ts — 地图引擎抽象接口 (中间路线)
// 覆盖核心操作 + 允许 getNative() 泄漏底层实例

import type { FeatureCollection } from 'geojson';
import type { EngineKind, LngLat, LngLatBounds } from './types';
import type { ITileSource } from './source';

// ---- 配置类型 ----

export interface MapEngineOptions {
  container: HTMLElement;
  center: LngLat;
  zoom: number;
  pitch?: number;
  bearing?: number;
  attributionControl?: boolean;
  /** 初始样式：style URL 或 style spec 对象 (MapLibre v6 必需) */
  style: string | unknown;
}

export interface FlyToOptions {
  duration?: number; // ms
  curve?: number; // 飞行曲线
  essential?: boolean; // 是否忽略用户偏好
  pitch?: number; // 俯仰角 (deg)
  bearing?: number; // 航向角 (deg)
}

export interface FitBoundsOptions {
  padding?: number;
  maxZoom?: number;
  duration?: number;
}

export interface CaptureOptions {
  /** 是否包含叠加图层 */
  includeOverlays?: boolean;
}

// ---- 图层样式 ----

export interface LayerStyle {
  /** 填充颜色 (CSS) */
  fillColor?: string;
  /** 填充透明度 0-1 */
  fillOpacity?: number;
  /** 描边颜色 (CSS) */
  strokeColor?: string;
  /** 描边宽度 (px) */
  strokeWidth?: number;
  /** 描边虚线 pattern */
  strokeDash?: number[];
}

// ---- 事件 ----

export type MapEvent =
  | 'load'
  | 'style.load'
  | 'idle'
  | 'error'
  | 'move'
  | 'moveend'
  | 'zoom'
  | 'zoomend'
  | 'click'
  | 'dblclick'
  | 'mousemove';

export type MapEventHandler = (e: unknown) => void;

// ---- 核心接口 ----

export interface IMapEngine {
  readonly kind: EngineKind;

  // 生命周期
  mount(options: MapEngineOptions): void;
  destroy(): void;
  isMounted(): boolean;

  // 视角控制
  flyTo(center: LngLat, zoom?: number, options?: FlyToOptions): void;
  setPitch(pitch: number): void;
  setBearing(bearing: number): void;
  fitBounds(bounds: LngLatBounds, options?: FitBoundsOptions): void;

  // 图层
  setTileSource(source: ITileSource): void;
  /** 返回 layerId，用于后续 removeLayer */
  addGeoJsonLayer(data: FeatureCollection, style?: LayerStyle): string;
  /** 更新已添加的 GeoJSON 图层，避免交互绘制时反复销毁图层 */
  updateGeoJsonLayer(layerId: string, data: FeatureCollection): void;
  removeLayer(layerId: string): void;

  // 事件
  on(event: MapEvent, handler: MapEventHandler): void;
  off(event: MapEvent, handler: MapEventHandler): void;

  // 查询
  getCenter(): LngLat;
  getZoom(): number;
  getBounds(): LngLatBounds;

  /** 从 Terrain3D 获取指定点高程 (m)，如果地形未加载则返回 null */
  queryElevation?(lngLat: LngLat): number | null;

  /** 截取视口画面 (Canvas → Blob)，为 AI 分析预留 */
  captureViewport(options?: CaptureOptions): Promise<Blob>;

  /** 投影模式控制 (墨卡托平面 / 3D 地球仪) */
  setProjection?(projection: 'mercator' | 'globe'): void;
  getProjection?(): 'mercator' | 'globe';

  /** 泄漏底层引擎实例，高级工具按需使用 */
  getNative(): unknown;
}
