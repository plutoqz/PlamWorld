// tools/enhanced-viewshed.tool.ts — 增强通视分析工具 (v0.6)
//
// 四种子模式：
//   1. multi-observer  — 多观察点合成（union/intersect/majority）
//   2. signal           — 信号覆盖热力（FSPL衰减）
//   3. radar            — 雷达扇形可视域
//   4. inter-vis        — 多点互视矩阵

import type { MapTool, ToolContext } from '../core/tools';
import type { LngLat } from '../core/types';
import type { ObserverPoint, SignalCoverageParams } from '../core/terrain';

// ---- 子模式 ----

export type EnhancedViewshedMode = 'multi-observer' | 'signal' | 'radar' | 'inter-vis';

export const MODE_LABELS: Record<EnhancedViewshedMode, string> = {
  'multi-observer': '多观察点',
  signal: '信号覆盖',
  radar: '雷达扇形',
  'inter-vis': '互视矩阵',
};

// ---- 工具状态 ----

export interface EnhancedViewshedState {
  mode: EnhancedViewshedMode;

  // 通用参数
  radiusKm: number;
  /** 格网分辨率 (默认 40) */
  gridSize: number;

  // Multi-observer
  observers: ObserverPoint[];

  // Signal
  signalParams: SignalCoverageParams;

  // Radar
  radarAzimuthDeg: number;
  radarBeamWidthDeg: number;

  // Inter-vis — 复用 observers 列表
}

// ---- 默认值 ----

const DEFAULT_SIGNAL_PARAMS: SignalCoverageParams = {
  frequencyMHz: 900,
  powerDBm: 40,
  antennaHeightM: 30,
};

const DEFAULT_STATE: EnhancedViewshedState = {
  mode: 'multi-observer',
  radiusKm: 10,
  gridSize: 40,
  observers: [],
  signalParams: { ...DEFAULT_SIGNAL_PARAMS },
  radarAzimuthDeg: 90,
  radarBeamWidthDeg: 60,
};

// ---- Tool ----

export class EnhancedViewshedTool implements MapTool {
  readonly id = 'enhanced-viewshed';
  readonly name = '增强通视分析';
  readonly icon = '📡';
  readonly category = 'measurement' as const;
  readonly description = '多观察点合成 / 信号覆盖热力 / 雷达扇形 / 互视矩阵';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;

  // 工具状态
  state: EnhancedViewshedState = { ...DEFAULT_STATE };

  // 回调
  private onStateChange: (() => void) | null = null;

  // ---- public helpers ----

  get engine() {
    return this.ctx?.engine ?? null;
  }

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  setMode(mode: EnhancedViewshedMode): void {
    this.state.mode = mode;
    this.onStateChange?.();
  }

  setRadiusKm(km: number): void {
    this.state.radiusKm = Math.max(1, Math.min(100, km));
    this.onStateChange?.();
  }

  setGridSize(n: number): void {
    this.state.gridSize = Math.max(20, Math.min(80, n));
    this.onStateChange?.();
  }

  // -- Multi-observer ----

  setObservers(obs: ObserverPoint[]): void {
    this.state.observers = obs;
    this.onStateChange?.();
  }

  addObserver(pt: LngLat, heightM = 2): void {
    const obs: ObserverPoint = {
      id: `obs-${Date.now()}`,
      lng: pt[0],
      lat: pt[1],
      heightM,
    };
    this.state.observers = [...this.state.observers, obs];
    this.onStateChange?.();
  }

  removeObserver(id: string): void {
    this.state.observers = this.state.observers.filter((o) => o.id !== id);
    this.onStateChange?.();
  }

  updateObserver(id: string, updates: Partial<ObserverPoint>): void {
    this.state.observers = this.state.observers.map((o) =>
      o.id === id ? { ...o, ...updates } : o,
    );
    this.onStateChange?.();
  }

  clearObservers(): void {
    this.state.observers = [];
    this.onStateChange?.();
  }

  // -- Signal ----

  setSignalParams(p: Partial<SignalCoverageParams>): void {
    this.state.signalParams = { ...this.state.signalParams, ...p };
    this.onStateChange?.();
  }

  // -- Radar ----

  setRadarAzimuth(deg: number): void {
    this.state.radarAzimuthDeg = ((deg % 360) + 360) % 360;
    this.onStateChange?.();
  }

  setRadarBeamWidth(deg: number): void {
    this.state.radarBeamWidthDeg = Math.max(10, Math.min(180, deg));
    this.onStateChange?.();
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
