// core/index.ts — 核心层统一导出

export type {
  LngLat,
  LngLatElevation,
  LngLatBounds,
  PixelPoint,
  EngineKind,
} from './types';

export type {
  IMapEngine,
  MapEngineOptions,
  FlyToOptions,
  FitBoundsOptions,
  CaptureOptions,
  LayerStyle,
  MapEvent,
  MapEventHandler,
} from './engine';

export type {
  ITileSource,
  TileSourceType,
  TileSourceCategory,
} from './source';

export { ToolRegistry } from './tools';
export type { MapTool, ToolContext } from './tools';

// 地形分析
export {
  generateSamplePoints,
  buildProfile,
  computeClimbStats,
  computeFloodMask,
  haversineDistance,
  interpolateLngLat,
} from './terrain';
export type {
  ElevationSample,
  ElevationProfile,
  ClimbStats,
  DEMGrid,
} from './terrain';

// 专题地图
export {
  classify,
  equalInterval,
  quantile,
  jenksNaturalBreaks,
  matchRegions,
  pickColors,
  findColorScheme,
  colorForValue,
  interpolateColor,
  levenshtein,
  COLOR_SCHEMES,
} from './choropleth';
export type {
  ParsedData,
  DataRow,
  MatchResult,
  ClassifyMethod,
  ColorSchemeType,
  ColorScheme,
  ChoroplethConfig,
} from './choropleth';

// 路径规划 (v0.6)
export {
  aStar,
  dijkstra,
  buildIsochrones,
  buildRoadGraph,
  directPath,
  haversineDistanceM,
  bearingDeg,
  speedFromHighway,
  edgeCost,
  MODE_SPEEDS,
  MODE_MAX_SLOPE,
} from './pathfinding';
export type {
  TravelMode,
  RouteOptions,
  RouteResult,
  RouteSegment,
  RouteGraph,
  GraphNode,
  GraphEdge,
  DijkstraResult,
  IsochroneContour,
} from './pathfinding';

// 地质剖面 (v0.6)
export {
  fetchGeoUnits,
  generateMockGeology,
  LITHOLOGY_COLORS,
  LITHOLOGY_LABELS,
  ERA_COLORS,
  ERA_LABELS,
} from './geology';
export type {
  Lithology,
  GeologicEra,
  GeoUnit,
  GeoProfilePoint,
  GeoProfile,
  ProfileRenderData,
} from './geology';

// 行政区划 (v0.6+)
export {
  getChinaProvinces,
  getWorldCountries,
  searchAdminRegions,
  getCombinedBoundariesGeoJson,
} from './admin-boundary';
export type {
  AdminLevel,
  AdminRegion,
  BoundaryLayerFilter,
} from './admin-boundary';
