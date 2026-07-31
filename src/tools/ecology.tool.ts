// tools/ecology.tool.ts — 生态 & 生物多样性工具 (v0.6)
//
// 物种分布多边形 + 迁徙路线动画 + IUCN 热力

import type { MapTool, ToolContext } from '../core/tools';
import type { SpeciesCategory, IUCNStatus } from '../core/ecology';
import { SPECIES, MIGRATION_ROUTES } from '../core/ecology';

// ---- 工具状态 ----

export type EcologyView = 'species' | 'migration' | 'hotspot';

export const VIEW_LABELS: Record<EcologyView, string> = {
  species: '物种分布',
  migration: '迁徙路线',
  hotspot: '保护热点',
};

export interface EcologyState {
  view: EcologyView;
  /** 筛选：分类 */
  categoryFilter: SpeciesCategory | 'all';
  /** 筛选：保护状态 */
  iucnFilter: IUCNStatus[];
  /** 当前高亮物种 */
  highlightSpeciesId: string | null;
  /** 迁徙动画播放 */
  isPlaying: boolean;
  /** 动画速度倍率 */
  animationSpeed: number;
}

const DEFAULT_STATE: EcologyState = {
  view: 'species',
  categoryFilter: 'all',
  iucnFilter: ['CR', 'EN', 'VU'],
  highlightSpeciesId: null,
  isPlaying: false,
  animationSpeed: 100,
};

// ---- Tool ----

export class EcologyTool implements MapTool {
  readonly id = 'ecology';
  readonly name = '生物多样性';
  readonly icon = '🦜';
  readonly category = 'visualization' as const;
  readonly description = '物种分布 / 迁徙路线 / IUCN 保护热力';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;

  state: EcologyState = { ...DEFAULT_STATE };

  private onStateChange: (() => void) | null = null;

  get engine() { return this.ctx?.engine ?? null; }

  setOnStateChange(cb: (() => void) | null): void { this.onStateChange = cb; }
  private notify(): void { this.onStateChange?.(); }

  // ---- setters ----

  setView(v: EcologyView): void { this.state.view = v; this.notify(); }
  setCategoryFilter(c: SpeciesCategory | 'all'): void { this.state.categoryFilter = c; this.notify(); }
  setIucnFilter(statuses: IUCNStatus[]): void { this.state.iucnFilter = statuses; this.notify(); }
  setHighlightSpecies(id: string | null): void { this.state.highlightSpeciesId = id; this.notify(); }
  setPlaying(v: boolean): void { this.state.isPlaying = v; this.notify(); }
  setAnimationSpeed(v: number): void { this.state.animationSpeed = v; this.notify(); }

  reset(): void { this.state = { ...DEFAULT_STATE }; this.notify(); }

  getAllSpecies() { return SPECIES; }
  getAllRoutes() { return MIGRATION_ROUTES; }

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
