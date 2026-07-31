// tools/sea-level-rise.tool.ts — 海平面上升模拟工具 (MapTool)

import type { MapTool, ToolContext } from '../core/tools';

export class SeaLevelRiseTool implements MapTool {
  readonly id = 'sea-level';
  readonly name = '海平面上升';
  readonly icon = '🌊';
  readonly category = 'simulation';
  readonly description = '模拟海平面上升 0-100m，实时淹没可视化';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private waterLevel = 5;

  /** 外部调用的渲染回调（由 FloodLayer 组件注入） */
  private renderCallback: ((level: number) => void) | null = null;

  onRender(cb: ((level: number) => void) | null): void {
    this.renderCallback = cb;
  }

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
  }

  deactivate(): void {
    this.active = false;
    this.ctx = null;
  }

  isActive(): boolean {
    return this.active;
  }

  getWaterLevel(): number {
    return this.waterLevel;
  }

  setWaterLevel(level: number): void {
    this.waterLevel = Math.max(0, Math.min(100, level));
    this.renderCallback?.(this.waterLevel);
  }

  getEngine() {
    return this.ctx?.engine ?? null;
  }

}
