// tools/true-size.tool.ts — 真实大小比较工具 (MapTool)
//
// 交互：选择两个区域 → 区域 A 幽灵图层可拖动 → 实时 Mercator 校正 → 面积比较

import type { MapTool, ToolContext } from '../core/tools';
import type { CountryFeature } from '../data/boundaries';

export class TrueSizeTool implements MapTool {
  readonly id = 'true-size';
  readonly name = '真实大小';
  readonly icon = '🌍';
  readonly category = 'comparison';
  readonly description = '拖动幽灵图层比较不同纬度区域真实面积';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;

  // 选中的区域
  regionA: CountryFeature | null = null;
  regionB: CountryFeature | null = null;

  // 幽灵中心 (WGS84)，由 GhostShape 拖拽更新
  ghostCenter: [number, number] = [0, 0];

  // 回调
  private onStateChange: (() => void) | null = null;

  // ---- public ----

  get engine() { return this.ctx?.engine ?? null; }

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  setRegionA(region: CountryFeature | null): void {
    this.regionA = region;
    if (region) {
      const bbox = (region.feature as any).bbox || computeBBox(region.feature);
      this.ghostCenter = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
    }
    this.onStateChange?.();
  }

  setRegionB(region: CountryFeature | null): void {
    this.regionB = region;
    this.onStateChange?.();
  }

  setGhostCenter(center: [number, number]): void {
    this.ghostCenter = center;
    this.onStateChange?.();
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
  }

  deactivate(): void {
    this.active = false;
    this.ctx = null;
    this.regionA = null;
    this.regionB = null;
  }

  isActive(): boolean {
    return this.active;
  }
}

/** 简单计算 Feature bbox */
function computeBBox(feature: any): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const walk = (coords: any[]) => {
    for (const item of coords) {
      if (typeof item[0] === 'number') {
        minLng = Math.min(minLng, item[0]);
        maxLng = Math.max(maxLng, item[0]);
        minLat = Math.min(minLat, item[1]);
        maxLat = Math.max(maxLat, item[1]);
      } else {
        walk(item);
      }
    }
  };
  walk(feature.geometry.coordinates);
  return [minLng, minLat, maxLng, maxLat];
}
