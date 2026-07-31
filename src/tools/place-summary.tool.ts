// tools/place-summary.tool.ts — 智能地点摘要工具 (MapTool)
// 点击地图任意位置，获取地点详情 + 周边 POI + 自然语言摘要

import type { MapTool, ToolContext } from '../core/tools';
import {
  reverseGeocode,
  queryNearbyPOIs,
  generatePlaceSummary,
  type PlaceInfo,
  type NearbyPOI,
} from '../core/geocode';
import type { LngLat } from '../core/types';
import type * as maplibregl from 'maplibre-gl';

export interface PlaceSummaryResult {
  place: PlaceInfo;
  pois: NearbyPOI[];
  summary: string;
}

export class PlaceSummaryTool implements MapTool {
  readonly id = 'place-summary';
  readonly name = '智能地点摘要';
  readonly icon = '📍';
  readonly category = 'navigation' as const;
  readonly description = '点击地图任意位置，获取地点详情 + 周边 POI + 自然语言摘要';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private clickHandler: ((e: maplibregl.MapMouseEvent) => void) | null = null;
  private onResultCallback: ((result: PlaceSummaryResult) => void) | null = null;
  private onLoadingCallback: ((loading: boolean) => void) | null = null;

  get engine() {
    return this.ctx?.engine ?? null;
  }

  /** 外部注入回调：结果就绪时调用 */
  onResult(cb: ((result: PlaceSummaryResult) => void) | null): void {
    this.onResultCallback = cb;
  }

  /** 外部注入回调：查询状态变化时调用 */
  onLoading(cb: ((loading: boolean) => void) | null): void {
    this.onLoadingCallback = cb;
  }

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;

    const map = ctx.engine.getNative() as maplibregl.Map;
    if (!map) return;

    const handler = (e: maplibregl.MapMouseEvent) => {
      const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];
      void this.handleClick(lngLat);
    };
    this.clickHandler = handler;

    map.on('click', handler);
  }

  deactivate(): void {
    this.active = false;

    if (this.ctx && this.clickHandler) {
      const map = this.ctx.engine.getNative() as maplibregl.Map;
      if (map) {
        map.off('click', this.clickHandler);
      }
    }

    this.clickHandler = null;
    this.ctx = null;
  }

  isActive(): boolean {
    return this.active;
  }

  private async handleClick(lngLat: LngLat): Promise<void> {
    this.onLoadingCallback?.(true);

    try {
      const [place, pois] = await Promise.all([
        reverseGeocode(lngLat),
        queryNearbyPOIs(lngLat, 500, ['transport', 'food', 'shopping', 'leisure', 'education', 'health']),
      ]);

      if (!place) {
        this.onLoadingCallback?.(false);
        return;
      }

      const summary = generatePlaceSummary(place, pois, 500);

      this.onResultCallback?.({
        place,
        pois,
        summary,
      });
    } catch {
      // silently fail
    } finally {
      this.onLoadingCallback?.(false);
    }
  }
}
