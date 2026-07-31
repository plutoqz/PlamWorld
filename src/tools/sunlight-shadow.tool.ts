// tools/sunlight-shadow.tool.ts — 阳光阴影模拟工具 (MapTool)
//
// 选日期+时间 → 计算太阳位置 → 动态 hillshade → Canvas 半透明阴影图层
// 依赖：suncalc（太阳位置计算）

import type { MapTool, ToolContext } from '../core/tools';

export interface SunPosition {
  azimuth: number;   // 方位角 (deg), 0=北 顺时针
  altitude: number;  // 高度角 (deg), 0=地平线 90=天顶
}

export class SunlightShadowTool implements MapTool {
  readonly id = 'sunlight-shadow';
  readonly name = '阳光阴影模拟';
  readonly icon = '☀️';
  readonly category = 'simulation';
  readonly description = '选时间 → 太阳位置 → 动态 hillshade';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private _date = new Date();
  private _playing = false;
  private _playSpeed = 1; // minutes per second
  private onStateChange: (() => void) | null = null;
  private _playTimer: ReturnType<typeof setInterval> | null = null;

  // ---- callbacks ----

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  notify(): void {
    this.onStateChange?.();
  }

  // ---- getters ----

  get date(): Date { return new Date(this._date); }
  get playing(): boolean { return this._playing; }
  get playSpeed(): number { return this._playSpeed; }
  get engine() { return this.ctx?.engine ?? null; }

  // ---- setters ----

  setDate(d: Date): void {
    this._date = new Date(d);
    this.notify();
  }

  setHour(h: number): void {
    this._date.setHours(h);
    this.notify();
  }

  setMinute(m: number): void {
    this._date.setMinutes(m);
    this.notify();
  }

  setPlaying(p: boolean): void {
    this._playing = p;
    if (p) this.startPlay();
    else this.stopPlay();
    this.notify();
  }

  setPlaySpeed(s: number): void {
    this._playSpeed = s;
    this.notify();
  }

  // ---- play loop ----

  private startPlay(): void {
    this.stopPlay();
    this._playTimer = setInterval(() => {
      const mins = this._date.getMinutes() + this._playSpeed;
      this._date.setMinutes(mins);
      if (this._date.getHours() >= 24) this._date.setHours(0);
      this.notify();
    }, 1000);
  }

  private stopPlay(): void {
    if (this._playTimer) {
      clearInterval(this._playTimer);
      this._playTimer = null;
    }
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
  }

  deactivate(): void {
    this.active = false;
    this.ctx = null;
    this.stopPlay();
    this._playing = false;
  }

  isActive(): boolean {
    return this.active;
  }
}
