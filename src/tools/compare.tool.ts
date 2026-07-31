// tools/compare.tool.ts — 图源对比工具 (MapTool)
//
// 支持两种模式：
//   'split' — 左右分屏，可拖动分隔条调整比例
//   'swipe' — 滑动帘，上层地图通过 clip-path 揭示下层
//
// 交互：
//   - 侧栏选择左右两侧图源
//   - 拖动分隔条/滑动手柄
//   - 两侧地图视角实时同步

import type { MapTool, ToolContext } from '../core/tools';
import { sourceRegistry } from '../sources/registry';

export type CompareMode = 'split' | 'swipe';

export class CompareTool implements MapTool {
  readonly id = 'compare';
  readonly name = '图源对比';
  readonly icon = '🔲';
  readonly category = 'comparison';
  readonly description = '双屏/滑动帘对比不同图源';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private _mode: CompareMode = 'split';
  private leftSourceId: string;
  private rightSourceId: string;

  // 回调（由 CompareView 注入）
  private onStateChange: (() => void) | null = null;

  constructor() {
    const sources = sourceRegistry.list();
    this.leftSourceId = sources[0]?.id ?? 'google-satellite';
    this.rightSourceId = sources[1]?.id ?? 'osm-raster';
  }

  // ---- public getters ----

  get mode(): CompareMode { return this._mode; }
  get leftSource(): string { return this.leftSourceId; }
  get rightSource(): string { return this.rightSourceId; }
  get engine() { return this.ctx?.engine ?? null; }

  // ---- callbacks ----

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  // ---- setters ----

  setMode(mode: CompareMode): void {
    this._mode = mode;
    this.onStateChange?.();
  }

  setLeftSource(sourceId: string): void {
    this.leftSourceId = sourceId;
    this.onStateChange?.();
  }

  setRightSource(sourceId: string): void {
    this.rightSourceId = sourceId;
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
