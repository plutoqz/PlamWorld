// tools/slope-aspect.tool.ts — 坡度/坡向分析工具 (MapTool)
//
// 交互：激活 → DEM 格网采样 → Horn 1981 计算 → 叠加色阶图层
// 切换显示模式：坡度 / 坡向 / 关
// 鼠标悬停 → 弹出该点坡度 + 坡向 + 高程

import type { MapTool, ToolContext } from '../core/tools';

export type SlopeAspectMode = 'slope' | 'aspect' | 'off';

export class SlopeAspectTool implements MapTool {
  readonly id = 'slope-aspect';
  readonly name = '坡度/坡向';
  readonly icon = '📐';
  readonly category = 'measurement';
  readonly description = 'Horn 1981 梯度卷积 → 坡度色阶图 + 坡向分类图';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private _mode: SlopeAspectMode = 'slope';

  // 回调（由 SlopeAspectLayer 注入）
  private onStateChange: (() => void) | null = null;

  // ---- public ----

  get mode(): SlopeAspectMode { return this._mode; }
  get engine() { return this.ctx?.engine ?? null; }

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  setMode(mode: SlopeAspectMode): void {
    this._mode = mode;
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
  }

  isActive(): boolean {
    return this.active;
  }
}
