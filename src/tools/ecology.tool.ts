// tools/ecology.tool.ts — 生态 & 生物多样性工具 (v0.6)
//
// 物种分布多边形 + GBIF 实地观测探索 + 迁徙路线动画 + IUCN 热力

import type { MapTool, ToolContext } from '../core/tools';
import type { SpeciesCategory, IUCNStatus, GBIFOccurrence, BiodiversityHotspot } from '../core/ecology';
import { SPECIES, MIGRATION_ROUTES, BIODIVERSITY_HOTSPOTS, searchGBIFOccurrences } from '../core/ecology';

// ---- 工具状态 ----

export type EcologyView = 'species' | 'explore' | 'migration' | 'hotspot';

export const VIEW_LABELS: Record<EcologyView, string> = {
  species: '经典物种',
  explore: '实地探索 (GBIF)',
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
  /** 当前选中的保护热点 */
  activeHotspotId: string | null;
  /** 迁徙动画播放 */
  isPlaying: boolean;
  /** 动画速度倍率 */
  animationSpeed: number;
  /** GBIF 真实实地物种观测记录 */
  occurrences: GBIFOccurrence[];
  /** 正在搜索 GBIF 记录 */
  isSearchingOccurrences: boolean;
  /** GBIF 搜索错误 */
  occurrenceError: string | null;
  /** 当前选中的实地观测记录 */
  selectedOccurrence: GBIFOccurrence | null;
}

const DEFAULT_STATE: EcologyState = {
  view: 'species',
  categoryFilter: 'all',
  iucnFilter: ['CR', 'EN', 'VU'],
  highlightSpeciesId: null,
  activeHotspotId: null,
  isPlaying: false,
  animationSpeed: 100,
  occurrences: [],
  isSearchingOccurrences: false,
  occurrenceError: null,
  selectedOccurrence: null,
};

// ---- Tool ----

export class EcologyTool implements MapTool {
  readonly id = 'ecology';
  readonly name = '生物多样性';
  readonly icon = '🦜';
  readonly category = 'visualization' as const;
  readonly description = '物种分布 / GBIF实地探索 / 迁徙路线 / IUCN 保护热力';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private abortCtrl: AbortController | null = null;

  state: EcologyState = { ...DEFAULT_STATE };

  private onStateChange: (() => void) | null = null;

  get engine() {
    return this.ctx?.engine ?? null;
  }

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  private notify(): void {
    this.onStateChange?.();
  }

  // ---- setters ----

  setView(v: EcologyView): void {
    this.state.view = v;
    this.notify();
  }

  setCategoryFilter(c: SpeciesCategory | 'all'): void {
    this.state.categoryFilter = c;
    this.notify();
  }

  setIucnFilter(statuses: IUCNStatus[]): void {
    this.state.iucnFilter = statuses;
    this.notify();
  }

  setHighlightSpecies(id: string | null): void {
    this.state.highlightSpeciesId = id;
    this.notify();
  }

  setActiveHotspot(id: string | null): void {
    this.state.activeHotspotId = id;
    this.notify();
  }

  setPlaying(v: boolean): void {
    this.state.isPlaying = v;
    this.notify();
  }

  setAnimationSpeed(v: number): void {
    this.state.animationSpeed = v;
    this.notify();
  }

  setSelectedOccurrence(occ: GBIFOccurrence | null): void {
    this.state.selectedOccurrence = occ;
    this.notify();
  }

  reset(): void {
    this.abortCtrl?.abort();
    this.state = { ...DEFAULT_STATE };
    this.notify();
  }

  getAllSpecies() {
    return SPECIES;
  }

  getAllRoutes() {
    return MIGRATION_ROUTES;
  }

  getAllHotspots(): BiodiversityHotspot[] {
    return BIODIVERSITY_HOTSPOTS;
  }

  /** 查询指定空间范围内的 GBIF 真实物种实地观测记录 */
  async searchOccurrences(bounds: [number, number, number, number]): Promise<void> {
    this.abortCtrl?.abort();
    const ctrl = new AbortController();
    this.abortCtrl = ctrl;

    this.state.isSearchingOccurrences = true;
    this.state.occurrenceError = null;
    this.notify();

    try {
      const res = await searchGBIFOccurrences({
        bounds,
        category: this.state.categoryFilter,
        iucnStatus: this.state.iucnFilter.length > 0 ? this.state.iucnFilter : undefined,
        limit: 35,
        signal: ctrl.signal,
      });

      if (ctrl.signal.aborted) return;
      this.state.occurrences = res.occurrences;
      this.state.occurrenceError =
        res.occurrences.length === 0 ? '当前视口未检索到带有相片的物种观测记录' : null;
    } catch (err) {
      if (!ctrl.signal.aborted) {
        this.state.occurrenceError = err instanceof Error ? err.message : 'GBIF 查询失败';
      }
    } finally {
      if (this.abortCtrl === ctrl) {
        this.state.isSearchingOccurrences = false;
        this.abortCtrl = null;
        this.notify();
      }
    }
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
    this.state = { ...DEFAULT_STATE };
  }

  deactivate(): void {
    this.abortCtrl?.abort();
    this.active = false;
    this.ctx = null;
    this.state = { ...DEFAULT_STATE };
  }

  isActive(): boolean {
    return this.active;
  }
}

