// tools/hydrology.tool.ts — 水文分析工具 (MapTool) v0.5
//
// 从 DEM 格网 → Worker 计算 D8 流向/流量累积/流域划分/TWI
// 可视化：流量累积热力图 + 流域边界线 + TWI 湿度渐变 + 流向箭头(可选)

import type { MapTool, ToolContext } from '../core/tools';
import type { LngLat } from '../core/types';
import { queryElevations } from '../engines/elevation-api';
import { WorkerBridge, type HydrologyInput, type HydrologyResult } from '../workers/worker-bridge';

/** 水文分析模式 */
export type HydrologyMode = 'flow-accumulation' | 'watershed' | 'twi';

/** 结果回调：主线程渲染组件注入 */
export interface HydrologyCallbacks {
  /** 计算完成 */
  onResult: (result: HydrologyResult) => void;
  /** 流域划分完成 */
  onWatershed: (result: HydrologyResult & { watershed: number[] }) => void;
  /** TWI 计算完成 */
  onTWI: (result: HydrologyResult & { twi: number[] }) => void;
  /** DEM 数据就绪 */
  onDEMReady: (params: {
    dem: Float32Array;
    cols: number;
    rows: number;
    cellSize: number;
    bounds: { west: number; south: number; east: number; north: number };
  }) => void;
  /** 进度 */
  onProgress: (msg: string, pct: number) => void;
  /** 倾泻点已选择 */
  onPourPoint?: (col: number, row: number, lngLat: LngLat) => void;
}

export class HydrologyTool implements MapTool {
  readonly id = 'hydrology';
  readonly name = '水文分析';
  readonly icon = '💧';
  readonly category = 'measurement';
  readonly description = 'D8 流向/流量累积/流域划分/TWI 湿度指数';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private callbacks: HydrologyCallbacks | null = null;
  private workerBridge: WorkerBridge | null = null;
  private _mode: HydrologyMode = 'flow-accumulation';
  private abortController: AbortController | null = null;

  /** 当前保存的 DEM 格网参数 */
  private demData: {
    dem: Float32Array;
    cols: number;
    rows: number;
    cellSize: number;
    bounds: { west: number; south: number; east: number; north: number };
  } | null = null;

  /** 当前倾泻点 */
  private _pourPoint: { col: number; row: number; lngLat: LngLat } | null = null;

  get pourPoint() { return this._pourPoint; }

  // ---- 外部接口 ----

  setCallbacks(cbs: HydrologyCallbacks | null): void {
    this.callbacks = cbs;
  }

  get mode(): HydrologyMode { return this._mode; }

  setMode(mode: HydrologyMode): void {
    this._mode = mode;
  }

  // ---- 核心操作 ----

  /** 从当前视口范围查询 DEM 格网，随后自动触发水文分析计算 */
  async analyzeRegion(): Promise<void> {
    if (!this.ctx) return;

    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      this.callbacks?.onProgress('查询 DEM 高程...', 0);

      // 1. 获取当前视口范围
      const engine = this.ctx.engine;
      const bounds = engine.getBounds();
      if (!bounds || !Array.isArray(bounds)) {
        this.callbacks?.onProgress('错误：无法获取地图范围', 0);
        return;
      }

      // bounds is [[west, south], [east, north]]
      const sw = bounds[0];
      const ne = bounds[1];
      const west = sw[0];
      const south = sw[1];
      const east = ne[0];
      const north = ne[1];

      // Generate grid points at ~100m resolution
      const resolutionMeters = 100;
      const latMetersPerDeg = 111320;
      const lngMetersPerDeg = 111320 * Math.cos(((north + south) / 2) * Math.PI / 180);
      const cellSize = resolutionMeters / latMetersPerDeg; // degrees
      const cellSizeLng = resolutionMeters / lngMetersPerDeg;

      const cols = Math.min(150, Math.max(20, Math.round((east - west) / cellSizeLng)));
      const rows = Math.min(150, Math.max(20, Math.round((north - south) / cellSize)));
      const actualCellSizeLat = (north - south) / rows;
      const actualCellSizeLng = (east - west) / cols;
      const actualCellSizeMeters = actualCellSizeLat * latMetersPerDeg;

      // 2. 生成规则格网采样点
      const points: LngLat[] = [];
      for (let r = rows - 1; r >= 0; r--) {
        for (let c = 0; c < cols; c++) {
          points.push([west + (c + 0.5) * actualCellSizeLng, south + (r + 0.5) * actualCellSizeLat] satisfies LngLat);
        }
      }

      // 3. 查询高程
      this.callbacks?.onProgress(`查询 ${points.length} 个高程点...`, 10);
      const elevations = await queryElevations(points, {
        signal,
        resolutionMeters,
        onProgress: (done, total) => {
          this.callbacks?.onProgress(`查询高程... ${done}/${total}`, 10 + Math.round((done / total) * 30));
        },
      });

      if (signal.aborted) return;

      // 4. 构造 DEM Float32Array (no-data 用邻域填充)
      const dem = new Float32Array(cols * rows);
      for (let i = 0; i < elevations.length; i++) {
        dem[i] = elevations[i] ?? NaN;
      }
      // 简单填补 NaN（用有效值的均值）
      const valid = [];
      for (let i = 0; i < dem.length; i++) {
        if (!isNaN(dem[i])) valid.push(dem[i]);
      }
      if (valid.length === 0) {
        this.callbacks?.onProgress('错误：DEM 区域无有效高程数据', 0);
        return;
      }
      const meanElevation = valid.reduce((a, b) => a + b, 0) / valid.length;
      for (let i = 0; i < dem.length; i++) {
        if (isNaN(dem[i])) dem[i] = meanElevation;
      }

      // 保存 DEM
      this.demData = { dem, cols, rows, cellSize: actualCellSizeMeters, bounds: { west, south, east, north } };

      this.callbacks?.onDEMReady({ dem, cols, rows, cellSize: actualCellSizeMeters, bounds: { west, south, east, north } });
      this.callbacks?.onProgress('DEM 数据就绪，开始水文分析...', 50);

      // 5. 发送到 Worker
      await this.runHydrologyAnalysis({ dem: Array.from(dem), cols, rows, cellSize: actualCellSizeMeters });

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.callbacks?.onProgress(`错误：${err.message}`, 0);
      console.error('[HydrologyTool]', err);
    }
  }

  /** 在 DEM 上选择倾泻点，触发流域划分 */
  async selectPourPoint(col: number, row: number, lngLat: LngLat): Promise<void> {
    if (!this.demData) return;

    this._pourPoint = { col, row, lngLat };

    // Clip to grid bounds
    const pc = Math.max(0, Math.min(this.demData.cols - 1, Math.round(col)));
    const pr = Math.max(0, Math.min(this.demData.rows - 1, Math.round(row)));

    this.callbacks?.onPourPoint?.(pc, pr, lngLat);

    if (!this.workerBridge) return;

    try {
      this.callbacks?.onProgress('流域划分中...', 80);
      const input: HydrologyInput & { pourCol: number; pourRow: number } = {
        dem: Array.from(this.demData.dem),
        cols: this.demData.cols,
        rows: this.demData.rows,
        cellSize: this.demData.cellSize,
        pourCol: pc,
        pourRow: pr,
      };
      const result = await this.workerBridge.hydrologyWatershed(input);
      this.callbacks?.onWatershed(result);
    } catch (err: any) {
      this.callbacks?.onProgress(`流域划分失败：${err.message}`, 0);
    }
  }

  /** 触发 TWI 计算 */
  async computeTWI(): Promise<void> {
    if (!this.demData || !this.workerBridge) return;

    try {
      this.callbacks?.onProgress('计算 TWI...', 80);
      const input: HydrologyInput = {
        dem: Array.from(this.demData.dem),
        cols: this.demData.cols,
        rows: this.demData.rows,
        cellSize: this.demData.cellSize,
      };
      const result = await this.workerBridge.hydrologyTWI(input);
      this.callbacks?.onTWI(result);
    } catch (err: any) {
      this.callbacks?.onProgress(`TWI 计算失败：${err.message}`, 0);
    }
  }

  // ---- 内部 ----

  private async runHydrologyAnalysis(input: HydrologyInput): Promise<void> {
    if (!this.workerBridge) {
      // 创建 Worker
      const worker = new Worker(new URL('../workers/geo.worker.ts', import.meta.url), { type: 'module' });
      this.workerBridge = new WorkerBridge(worker);
    }

    try {
      this.callbacks?.onProgress('计算 D8 流向 + 流量累积...', 60);
      const result = await this.workerBridge.hydrology(input);

      this.callbacks?.onProgress('水文分析完成', 100);

      if (this._mode === 'twi') {
        await this.computeTWI();
      } else {
        this.callbacks?.onResult(result);
      }
    } catch (err: any) {
      this.callbacks?.onProgress(`水文分析失败：${err.message}`, 0);
      console.error('[HydrologyTool]', err);
    }
  }

  // ---- 生命周期 ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
  }

  deactivate(): void {
    this.active = false;
    this.ctx = null;
    this.abortController?.abort();
    this.abortController = null;
    this.workerBridge?.terminate();
    this.workerBridge = null;
    this.demData = null;
    this._pourPoint = null;
  }

  isActive(): boolean {
    return this.active;
  }
}
