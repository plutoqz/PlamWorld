// core/types.ts — 通用 GIS 数据类型
// 所有地理坐标类型统一从这里引用

/** WGS84 经纬度 */
export type LngLat = [lng: number, lat: number];

/** WGS84 经纬度 + 海拔 (m) */
export type LngLatElevation = [lng: number, lat: number, elevation: number];

/** 包围盒 [西南, 东北] */
export type LngLatBounds = [sw: LngLat, ne: LngLat];

/** 像素坐标 */
export type PixelPoint = [x: number, y: number];

/** 地图引擎类型 */
export type EngineKind = 'maplibre' | 'leaflet' | 'cesium';
