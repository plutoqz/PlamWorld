// tools/geology-profile.tool.ts — 地质剖面可视化工具 (v0.6)
//
// 在地图上画一条剖面线 → 查询 Macrostrat API 获取沿线地质单元
// → Canvas 渲染上下双板剖面图：上板地表高程 + 下板岩层结构
// 降级：API 不可用时使用内置模拟地质数据

import type { MapTool, ToolContext } from '../core/tools';
import type { LngLat } from '../core/types';
import type { GeoProfile } from '../core/geology';

// ---- 工具状态 ----

export interface GeologyProfileState {
  /** 剖面线 */
  profileLine: LngLat[];
  /** 地质剖面数据 */
  profile: GeoProfile | null;
  /** 当前查询状态 */
  status: 'idle' | 'drawing' | 'loading' | 'ready' | 'error';
  /** 错误信息 */
  error: string | null;
  /** 降级模式：true = 使用模拟数据 */
  mockMode: boolean;
}

const DEFAULT_STATE: GeologyProfileState = {
  profileLine: [],
  profile: null,
  status: 'idle',
  error: null,
  mockMode: false,
};

// ---- Tool ----

export class GeologyProfileTool implements MapTool {
  readonly id = 'geology-profile';
  readonly name = '地质剖面';
  readonly icon = '⛰️';
  readonly category = 'visualization' as const;
  readonly description = '岩层结构剖面 / Macrostrat API / Canvas 双板渲染';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;

  state: GeologyProfileState = { ...DEFAULT_STATE };

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

  addPoint(pt: LngLat): void {
    this.state.profileLine = [...this.state.profileLine, pt];
    this.state.status = this.state.profileLine.length < 2 ? 'drawing' : this.state.status;
    this.notify();
  }

  clearPoints(): void {
    this.state.profileLine = [];
    this.state.profile = null;
    this.state.status = 'idle';
    this.state.error = null;
    this.notify();
  }

  setStatus(status: GeologyProfileState['status']): void {
    this.state.status = status;
    this.notify();
  }

  setProfile(profile: GeoProfile | null): void {
    this.state.profile = profile;
    this.notify();
  }

  setError(error: string | null): void {
    this.state.error = error;
    this.notify();
  }

  setMockMode(v: boolean): void {
    this.state.mockMode = v;
    this.notify();
  }

  reset(): void {
    this.state = { ...DEFAULT_STATE };
    this.notify();
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
