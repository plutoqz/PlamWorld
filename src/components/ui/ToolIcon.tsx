import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Building2,
  ChartLine,
  Columns2,
  Crosshair,
  Droplets,
  Earth,
  Eye,
  Flame,
  FolderOpen,
  Gauge,
  Globe2,
  History,
  Layers3,
  LocateFixed,
  MapPinned,
  MessageSquare,
  Mountain,
  Navigation,
  Palette,
  Plane,
  Ruler,
  Satellite,
  Search,
  Sun,
  Triangle,
  Waves,
} from 'lucide-react';
import type { ToolCategory } from '@core/tools';

const TOOL_ICONS: Record<string, LucideIcon> = {
  search: Search,
  locate: LocateFixed,
  measure: Ruler,
  profile: ChartLine,
  'sea-level': Waves,
  compare: Columns2,
  'slope-aspect': Triangle,
  'true-size': Globe2,
  viewshed: Eye,
  heatmap: Flame,
  'layer-import': FolderOpen,
  'time-travel': History,
  fly: Plane,
  choropleth: Palette,
  'projection-switch': Earth,
  'sunlight-shadow': Sun,
  'peak-finder': Mountain,
  'story-map': BookOpen,
  geoguessr: Crosshair,
  '3d-buildings': Building2,
  hydrology: Droplets,
  'place-summary': MapPinned,
  'nl-search': MessageSquare,
  'image-analysis': Satellite,
};

export const CATEGORY_ICONS: Record<ToolCategory, LucideIcon> = {
  navigation: Navigation,
  measurement: Ruler,
  visualization: Palette,
  simulation: Gauge,
  comparison: Layers3,
  story: MapPinned,
};

interface ToolIconProps {
  toolId: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function ToolIcon({ toolId, size = 17, strokeWidth = 1.8, className }: ToolIconProps) {
  const Icon = TOOL_ICONS[toolId] ?? Layers3;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}
