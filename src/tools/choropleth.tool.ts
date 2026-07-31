// tools/choropleth.tool.ts — 趣味地图生成 / 专题数据地图工具 (MapTool)
//
// 交互：
//   1. 用户上传 CSV/JSON 数据
//   2. 列映射：选择区域名列 + 数值列
//   3. 自动匹配区域名→GeoJSON 边界
//   4. 选择分类方法 + 色阶 → MapLibre fill layer

import type { MapTool, ToolContext } from '../core/tools';
import type { ParsedData, ClassifyMethod, ChoroplethConfig } from '../core/choropleth';
import { classify, pickColors, findColorScheme } from '../core/choropleth';

export interface ChoroplethToolState {
  data: ParsedData | null;
  config: Partial<ChoroplethConfig>;
  regionNameCol: string | null;
  valueCol: string | null;
  groupCol: string | null;
  method: ClassifyMethod;
  k: number;
  colorSchemeId: string;
}

export class ChoroplethTool implements MapTool {
  readonly id = 'choropleth';
  readonly name = '趣味地图生成';
  readonly icon = '🎨';
  readonly category = 'visualization';
  readonly description = '上传数据生成专题地图（Choropleth）';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private state: ChoroplethToolState;
  private onStateChange: (() => void) | null = null;

  constructor() {
    this.state = {
      data: null,
      config: {},
      regionNameCol: null,
      valueCol: null,
      groupCol: null,
      method: 'jenks',
      k: 5,
      colorSchemeId: 'rdbu',
    };
  }

  // ---- callbacks ----

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  notify(): void {
    this.onStateChange?.();
  }

  // ---- getters ----

  getState(): Readonly<ChoroplethToolState> {
    return this.state;
  }

  getEngine() {
    return this.ctx?.engine ?? null;
  }

  // ---- setters ----

  setData(data: ParsedData): void {
    this.state = { ...this.state, data };
    // 自动推断列名
    if (data.columns.length >= 2) {
      // 找数值列（优先数字列）
      const numCol = data.columns.find((c) =>
        data.rows.slice(0, 5).every((r) => {
          const v = r[c];
          return v !== '' && v !== undefined && !isNaN(Number(v));
        }),
      );
      // 找文本列（优先字符串列）
      const textCol = data.columns.find((c) =>
        data.rows.slice(0, 5).every((r) => {
          const v = r[c];
          return typeof v === 'string' && v.trim().length > 0;
        }),
      );
      this.state = {
        ...this.state,
        regionNameCol: textCol ?? null,
        valueCol: numCol ?? null,
      };
    }
    this.notify();
  }

  setRegionNameCol(col: string | null): void {
    this.state = { ...this.state, regionNameCol: col };
    this.notify();
  }

  setValueCol(col: string | null): void {
    this.state = { ...this.state, valueCol: col };
    this.notify();
  }

  setGroupCol(col: string | null): void {
    this.state = { ...this.state, groupCol: col };
    this.notify();
  }

  setMethod(method: ClassifyMethod): void {
    this.state = { ...this.state, method };
    this.notify();
  }

  setK(k: number): void {
    this.state = { ...this.state, k };
    this.notify();
  }

  setColorSchemeId(id: string): void {
    this.state = { ...this.state, colorSchemeId: id };
    this.notify();
  }

  // ---- 构建 ChoroplethConfig（供 MapLegend / 图层渲染使用） ----

  buildConfig(
    regionValues: Map<string, number>,
    regionFeatures: Map<string, GeoJSON.Feature>,
  ): ChoroplethConfig {
    return {
      regionValues,
      regionFeatures,
      method: this.state.method,
      k: this.state.k,
      manualBreaks: [],
      colorSchemeId: this.state.colorSchemeId,
      valueRange: [0, 1],
    };
  }

  /** 获取分类断点和色阶颜色（纯计算，不依赖引擎） */
  computeColors(): { breaks: number[]; range: [number, number]; colors: string[] } | null {
    const { data, valueCol, method, k, colorSchemeId } = this.state;
    if (!data || !valueCol) return null;

    const values = data.rows
      .map((r) => Number(r[valueCol]))
      .filter((v) => typeof v === 'number' && !isNaN(v));
    if (values.length === 0) return null;

    const { breaks, range } = classify(values, method, k);
    const scheme = findColorScheme(colorSchemeId);
    if (!scheme) return null;
    const colors = pickColors(scheme, method === 'continuous' ? 9 : breaks.length + 1);

    return { breaks, range, colors };
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
