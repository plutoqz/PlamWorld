// tools/route-planner.tool.ts — 路径规划工具 (v0.6)
//
// 功能：
//   1. A* 路网寻路 — 从 OSM 矢量瓦片构建图 → A* 最短路径
//   2. 等时线 (Isochrone) — Dijkstra 扩展 + 凸包 → 时间圈层
//   3. 直线降级 — 无路网时走大圆直线 + DEM 高程

import type { MapTool, ToolContext } from '../core/tools';
import type { LngLat } from '../core/types';
import type {
  TravelMode,
  RouteResult,
  IsochroneContour,
} from '../core/pathfinding';

// ---- 工具状态 ----

export type RoutePlannerMode = 'route' | 'isochrone';

export const MODE_LABELS: Record<RoutePlannerMode, string> = {
  route: '路径规划',
  isochrone: '等时线',
};

export interface RoutePlannerState {
  mode: RoutePlannerMode;
  travelMode: TravelMode;
  /** 路径：起点 */
  start: LngLat | null;
  /** 路径：终点 */
  end: LngLat | null;
  /** 等时线：中心点 */
  isochroneCenter: LngLat | null;
  /** 等时线时间阈值 (min) */
  isochroneThresholds: number[];
  /** 最新路径结果 */
  routeResult: RouteResult | null;
  /** 最新等时线结果 */
  isochroneResult: IsochroneContour[] | null;
}

const DEFAULT_STATE: RoutePlannerState = {
  mode: 'route',
  travelMode: 'walking',
  start: null,
  end: null,
  isochroneCenter: null,
  isochroneThresholds: [5, 10, 20, 30, 60],
  routeResult: null,
  isochroneResult: null,
};

// ---- Tool ----

export class RoutePlannerTool implements MapTool {
  readonly id = 'route-planner';
  readonly name = '路径规划';
  readonly icon = '🗺️';
  readonly category = 'measurement' as const;
  readonly description = 'A* 路径搜索 / 等时线分析 / 高程代价';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;

  state: RoutePlannerState = { ...DEFAULT_STATE };

  private onStateChange: (() => void) | null = null;

  get engine() { return this.ctx?.engine ?? null; }

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  private notify(): void { this.onStateChange?.(); }

  // ---- setters ----

  setMode(mode: RoutePlannerMode): void {
    this.state.mode = mode;
    this.notify();
  }

  setTravelMode(mode: TravelMode): void {
    this.state.travelMode = mode;
    this.notify();
  }

  setStart(pt: LngLat | null): void {
    this.state.start = pt;
    this.state.routeResult = null;
    this.notify();
  }

  setEnd(pt: LngLat | null): void {
    this.state.end = pt;
    this.state.routeResult = null;
    this.notify();
  }

  setIsochroneCenter(pt: LngLat | null): void {
    this.state.isochroneCenter = pt;
    this.state.isochroneResult = null;
    this.notify();
  }

  setIsochroneThresholds(thresholds: number[]): void {
    this.state.isochroneThresholds = thresholds;
    this.notify();
  }

  setRouteResult(result: RouteResult | null): void {
    this.state.routeResult = result;
    this.notify();
  }

  setIsochroneResult(result: IsochroneContour[] | null): void {
    this.state.isochroneResult = result;
    this.notify();
  }

  reset(): void {
    this.state = { ...DEFAULT_STATE };
    this.notify();
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
    this.state = { ...DEFAULT_STATE };
  }

  deactivate(): void {
    this.active = false;
    this.ctx = null;
    this.state = { ...DEFAULT_STATE };
  }

  isActive(): boolean {
    return this.active;
  }
}
