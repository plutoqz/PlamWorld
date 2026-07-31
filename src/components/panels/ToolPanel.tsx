import { X } from 'lucide-react';
import { useUIStore } from '@stores/uiStore';
import { toolRegistry } from '@tools/registry';
import {
  profileTool,
  seaLevelRiseTool,
  measureTool,
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
} from '@tools/registry';
import { ToolIcon } from '@components/ui/ToolIcon';
import { ElevationProfilePanel } from './sub/ProfilePanel';
import { MeasurePanel } from './sub/MeasurePanel';
import { FloodLayer } from '@components/terrain/FloodLayer';
import { CompareView } from '@components/compare/CompareView';
import { SlopeAspectLayer } from '@components/terrain/SlopeAspectLayer';
import { TrueSizePanel } from '@components/true-size/TrueSizePanel';
import { ViewshedLayer } from '@components/terrain/ViewshedLayer';
import { HeatmapLayer } from '@components/terrain/HeatmapLayer';
import { LayerImportPanel } from '@components/panels/LayerImportPanel';
import { TimeTravelPanel } from '@components/panels/TimeTravelPanel';
import { FlyPanel } from '@components/panels/FlyPanel';
import { ChoroplethPanel } from '@components/visual/ChoroplethPanel';
import { ProjectionPanel } from '@components/panels/ProjectionPanel';
import { SunlightControl } from '@components/visual/SunlightControl';
import { PeakLabels } from '@components/visual/PeakLabels';
import { StoryPlayer } from '@components/visual/StoryPlayer';
import { GeoGuessrPanel } from '@components/panels/GeoGuessrPanel';
import { HydrologyPanel } from '@components/panels/HydrologyPanel';
import { PlaceSummaryPanel } from '@components/panels/PlaceSummaryPanel';
import { NLSearchPanel } from '@components/panels/NLSearchPanel';
import { ImageAnalysisPanel } from '@components/panels/ImageAnalysisPanel';
import { EnhancedViewshedLayer } from '@components/terrain/EnhancedViewshedLayer';
import { RoutePlannerPanel } from '@components/panels/RoutePlannerPanel';
import { GeologyPanel } from '@components/panels/GeologyPanel';
import { DynastyPanel } from '@components/panels/DynastyPanel';
import { EcologyPanel } from '@components/panels/EcologyPanel';
import { LiteraryPanel } from '@components/panels/LiteraryPanel';

interface PanelProps {
  sidebarOpen: boolean;
}

const PANEL_MAP: Record<string, React.FC<PanelProps>> = {
  'sea-level': () => <FloodLayer tool={seaLevelRiseTool} />,
  profile: () => <ElevationProfilePanel tool={profileTool} />,
  measure: () => <MeasurePanel tool={measureTool} />,
  compare: () => <CompareView tool={compareTool} />,
  'slope-aspect': () => <SlopeAspectLayer tool={slopeAspectTool} />,
  'true-size': () => <TrueSizePanel tool={trueSizeTool} />,
  viewshed: () => <ViewshedLayer tool={viewshedTool} />,
  heatmap: () => <HeatmapLayer tool={heatmapTool} />,
  'layer-import': () => <LayerImportPanel tool={layerImportTool} />,
  'time-travel': () => <TimeTravelPanel tool={timeTravelTool} />,
  fly: () => <FlyPanel tool={flyTool} />,
  choropleth: () => <ChoroplethPanel tool={choroplethTool} />,
  'projection-switch': ({ sidebarOpen }) => <ProjectionPanel tool={projectionSwitchTool} sidebarOpen={sidebarOpen} />,
  'sunlight-shadow': () => <SunlightControl tool={sunlightShadowTool} />,
  'peak-finder': () => <PeakLabels tool={peakFinderTool} />,
  'story-map': () => <StoryPlayer tool={storyMapTool} />,
  geoguessr: () => <GeoGuessrPanel tool={geoGuessrTool} />,
  hydrology: () => <HydrologyPanel tool={hydrologyTool} />,
  'place-summary': () => <PlaceSummaryPanel tool={placeSummaryTool} />,
  'nl-search': () => <NLSearchPanel tool={nlSearchTool} />,
  'image-analysis': () => <ImageAnalysisPanel tool={imageAnalysisTool} />,
  'enhanced-viewshed': () => <EnhancedViewshedLayer tool={enhancedViewshedTool} />,
  'route-planner': () => <RoutePlannerPanel tool={routePlannerTool} />,
  'geology-profile': () => <GeologyPanel tool={geologyProfileTool} />,
  'dynasty-overlay': () => <DynastyPanel tool={dynastyOverlayTool} />,
  'ecology': () => <EcologyPanel tool={ecologyTool} />,
  'literary-map': () => <LiteraryPanel tool={literaryMapTool} />,
};

const FULLSCREEN_TOOLS = new Set(['compare', 'projection-switch']);

export function ToolPanel({ sidebarOpen }: PanelProps) {
  const activeToolId = useUIStore((state) => state.activeToolId);
  const setActiveTool = useUIStore((state) => state.setActiveTool);
  if (!activeToolId) return null;

  const PanelComponent = PANEL_MAP[activeToolId];
  const tool = toolRegistry.get(activeToolId);
  if (!PanelComponent || !tool) return null;

  const closeTool = () => {
    toolRegistry.deactivate();
    setActiveTool(null);
  };

  if (FULLSCREEN_TOOLS.has(activeToolId)) {
    return (
      <>
        <PanelComponent sidebarOpen={sidebarOpen} />
        <div className={`pw-overlay-tool-chip ${sidebarOpen ? 'with-sidebar' : ''}`}>
          <ToolIcon toolId={activeToolId} size={16} />
          <span>{tool.name}</span>
          <button type="button" onClick={closeTool} title="关闭工具" aria-label="关闭工具"><X size={15} /></button>
        </div>
      </>
    );
  }

  return (
    <aside className="pw-inspector" aria-label={`${tool.name}控制面板`}>
      <header className="pw-inspector-header">
        <span className="pw-inspector-icon"><ToolIcon toolId={activeToolId} size={18} /></span>
        <div>
          <strong>{tool.name}</strong>
          <span>{tool.description}</span>
        </div>
        <button type="button" onClick={closeTool} title="关闭工具" aria-label="关闭工具"><X size={17} /></button>
      </header>
      <div className="pw-inspector-body">
        <PanelComponent sidebarOpen={sidebarOpen} />
      </div>
    </aside>
  );
}
