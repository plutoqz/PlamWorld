// tools/dynasty-overlay.tool.ts — 古代疆域矢量叠加工具 (v0.6)
//
// 时间轴拖动切换朝代 → 疆域 Polygon 叠加在现代地图上
// 支持透明度调节、朝代对比模式、古今地名连线

import type { MapTool, ToolContext } from '../core/tools';
import type { DynastyDef } from '../core/dynasty';
import { DYNASTIES } from '../core/dynasty';

// ---- 工具状态 ----

export interface DynastyOverlayState {
  /** 当前选中朝代 ID */
  activeDynastyId: string | null;
  /** 透明度 (0-1) */
  opacity: number;
  /** 是否显示所有朝代 */
  showAll: boolean;
  /** 对比模式：第二个朝代 ID */
  compareDynastyId: string | null;
  /** 对比模式透明度 */
  compareOpacity: number;
}

const DEFAULT_STATE: DynastyOverlayState = {
  activeDynastyId: null,
  opacity: 0.30,
  showAll: false,
  compareDynastyId: null,
  compareOpacity: 0.20,
};

// ---- Tool ----

export class DynastyOverlayTool implements MapTool {
  readonly id = 'dynasty-overlay';
  readonly name = '古代疆域';
  readonly icon = '🏯';
  readonly category = 'visualization' as const;
  readonly description = '历代疆域叠加 / 时间轴 / 朝代对比';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;

  state: DynastyOverlayState = { ...DEFAULT_STATE };

  private onStateChange: (() => void) | null = null;

  get engine() { return this.ctx?.engine ?? null; }

  setOnStateChange(cb: (() => void) | null): void { this.onStateChange = cb; }
  private notify(): void { this.onStateChange?.(); }

  // ---- setters ----

  setActiveDynasty(id: string | null): void {
    this.state.activeDynastyId = id;
    this.notify();
  }

  setOpacity(v: number): void {
    this.state.opacity = Math.max(0, Math.min(1, v));
    this.notify();
  }

  setShowAll(v: boolean): void {
    this.state.showAll = v;
    this.notify();
  }

  setCompareDynasty(id: string | null): void {
    this.state.compareDynastyId = id;
    this.notify();
  }

  setCompareOpacity(v: number): void {
    this.state.compareOpacity = Math.max(0, Math.min(1, v));
    this.notify();
  }

  reset(): void {
    this.state = { ...DEFAULT_STATE };
    this.notify();
  }

  // ---- helpers ----

  getActiveDynasty(): DynastyDef | null {
    return DYNASTIES.find(d => d.id === this.state.activeDynastyId) ?? null;
  }

  getCompareDynasty(): DynastyDef | null {
    return DYNASTIES.find(d => d.id === this.state.compareDynastyId) ?? null;
  }

  getAllDynasties(): DynastyDef[] {
    return DYNASTIES;
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

  isActive(): boolean { return this.active; }
}
