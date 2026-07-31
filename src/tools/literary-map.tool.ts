// tools/literary-map.tool.ts — 文学地图工具 (v0.6)
//
// 加载 ILiteraryMapSource → 在地图上渲染锚点 + 路线
// 首发：山海经

import type { MapTool, ToolContext } from '../core/tools';
import type { ILiteraryMapSource } from '../core/literary-map';
import { SHANHAI_JING_SOURCE } from '../sources/literary/shanhai-jing';

// ---- 工具状态 ----

export type LiteraryViewMode = 'anchors' | 'routes' | 'gallery' | 'fantasy';

export const VIEW_LABELS: Record<LiteraryViewMode, string> = {
  anchors: '锚点地图',
  routes: '叙事路线',
  gallery: '异兽图鉴',
  fantasy: '幻想空间',
};

export interface LiteraryMapState {
  source: ILiteraryMapSource;
  view: LiteraryViewMode;
  /** 筛选置信度 */
  confidenceFilter: ('exact' | 'approximate' | 'conjectural' | 'mythical')[];
  /** 高亮锚点 */
  highlightAnchorId: string | null;
  /** 路线动画播放 */
  routePlaying: boolean;
  /** 当前播放的路线索引 */
  activeRouteIdx: number;
}

const DEFAULT_STATE: LiteraryMapState = {
  source: SHANHAI_JING_SOURCE,
  view: 'anchors',
  confidenceFilter: ['exact', 'approximate', 'conjectural', 'mythical'],
  highlightAnchorId: null,
  routePlaying: false,
  activeRouteIdx: 0,
};

// ---- Tool ----

export class LiteraryMapTool implements MapTool {
  readonly id = 'literary-map';
  readonly name = '文学地图';
  readonly icon = '📜';
  readonly category = 'story' as const;
  readonly description = '山海经 / ILiteraryMapSource 框架 / 双空间耦合';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;

  state: LiteraryMapState = { ...DEFAULT_STATE };

  private onStateChange: (() => void) | null = null;

  get engine() { return this.ctx?.engine ?? null; }

  setOnStateChange(cb: (() => void) | null): void { this.onStateChange = cb; }
  private notify(): void { this.onStateChange?.(); }

  // ---- setters ----

  setView(v: LiteraryViewMode): void { this.state.view = v; this.notify(); }
  setConfidenceFilter(f: typeof this.state.confidenceFilter): void { this.state.confidenceFilter = f; this.notify(); }
  setHighlightAnchor(id: string | null): void { this.state.highlightAnchorId = id; this.notify(); }
  setRoutePlaying(v: boolean): void { this.state.routePlaying = v; this.notify(); }
  setActiveRouteIdx(i: number): void { this.state.activeRouteIdx = i; this.notify(); }

  getSource(): ILiteraryMapSource { return this.state.source; }

  reset(): void { this.state = { ...DEFAULT_STATE }; this.notify(); }

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
