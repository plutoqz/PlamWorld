// tools/registry.ts — 工具注册实例

import { ToolRegistry } from '../core/tools';
import { SearchTool } from './search.tool';
import { LocateTool } from './locate.tool';
import { MeasureTool } from './measure.tool';
import { ElevationProfileTool } from './elevation-profile.tool';
import { SeaLevelRiseTool } from './sea-level-rise.tool';
import { CompareTool } from './compare.tool';
import { SlopeAspectTool } from './slope-aspect.tool';
import { TrueSizeTool } from './true-size.tool';
import { ViewshedTool } from './viewshed.tool';
import { HeatmapTool } from './heatmap.tool';
import { LayerImportTool } from './layer-import.tool';
import { TimeTravelTool } from './time-travel.tool';
import { FlyTool } from './fly.tool';
import { ChoroplethTool } from './choropleth.tool';
import { ProjectionSwitchTool } from './projection-switch.tool';
import { SunlightShadowTool } from './sunlight-shadow.tool';
import { PeakFinderTool } from './peak-finder.tool';
import { StoryMapTool } from './story-map.tool';
import { GeoGuessrTool } from './geoguessr.tool';
import { Buildings3DTool } from './3d-buildings.tool';
import { HydrologyTool } from './hydrology.tool';
import { PlaceSummaryTool } from './place-summary.tool';
import { NLSearchTool } from './nl-search.tool';
import { ImageAnalysisTool } from './image-analysis.tool';
import { EnhancedViewshedTool } from './enhanced-viewshed.tool';
import { RoutePlannerTool } from './route-planner.tool';
import { GeologyProfileTool } from './geology-profile.tool';
import { DynastyOverlayTool } from './dynasty-overlay.tool';
import { EcologyTool } from './ecology.tool';
import { LiteraryMapTool } from './literary-map.tool';
import { AdminBoundaryTool } from './admin-boundary.tool';

export const toolRegistry = new ToolRegistry();

export const searchTool = new SearchTool();
export const measureTool = new MeasureTool();
export const profileTool = new ElevationProfileTool();
export const seaLevelRiseTool = new SeaLevelRiseTool();
export const compareTool = new CompareTool();
export const slopeAspectTool = new SlopeAspectTool();
export const trueSizeTool = new TrueSizeTool();
export const viewshedTool = new ViewshedTool();
export const heatmapTool = new HeatmapTool();
export const layerImportTool = new LayerImportTool();
export const timeTravelTool = new TimeTravelTool();
export const flyTool = new FlyTool();
export const choroplethTool = new ChoroplethTool();
export const projectionSwitchTool = new ProjectionSwitchTool();
export const sunlightShadowTool = new SunlightShadowTool();
export const peakFinderTool = new PeakFinderTool();
export const storyMapTool = new StoryMapTool();
export const geoGuessrTool = new GeoGuessrTool();
export const buildings3DTool = new Buildings3DTool();
export const hydrologyTool = new HydrologyTool();
export const placeSummaryTool = new PlaceSummaryTool();
export const nlSearchTool = new NLSearchTool();
export const imageAnalysisTool = new ImageAnalysisTool();
export const enhancedViewshedTool = new EnhancedViewshedTool();
export const routePlannerTool = new RoutePlannerTool();
export const geologyProfileTool = new GeologyProfileTool();
export const dynastyOverlayTool = new DynastyOverlayTool();
export const ecologyTool = new EcologyTool();
export const literaryMapTool = new LiteraryMapTool();
export const adminBoundaryTool = new AdminBoundaryTool();

toolRegistry.registerAll([
  searchTool,
  new LocateTool(),
  measureTool,
  profileTool,
  seaLevelRiseTool,
  compareTool,
  slopeAspectTool,
  trueSizeTool,
  viewshedTool,
  heatmapTool,
  layerImportTool,
  timeTravelTool,
  flyTool,
  choroplethTool,
  projectionSwitchTool,
  sunlightShadowTool,
  peakFinderTool,
  storyMapTool,
  geoGuessrTool,
  buildings3DTool,
  hydrologyTool,
  placeSummaryTool,
  nlSearchTool,
  imageAnalysisTool,
  enhancedViewshedTool,
  routePlannerTool,
  geologyProfileTool,
  dynastyOverlayTool,
  ecologyTool,
  literaryMapTool,
  adminBoundaryTool,
]);
