// tools/image-analysis.tool.ts — 卫星图色彩分析工具 (MapTool)
//
// 交互：
//   1. 捕获当前视口卫星影像（canvas → blob → ImageBitmap）
//   2. 逐像素分类：植被 / 水体 / 建筑 / 其他
//   3. 计算各类别占比，回调通知结果

import type { MapTool, ToolContext } from '../core/tools';

// ---- 分析结果 ----

export interface ImageAnalysisResult {
  vegetation: number; // 植被像素数
  water: number;      // 水体像素数
  building: number;   // 建筑/城区像素数
  other: number;      // 其他像素数
  totalPixels: number;
}

export type ImageAnalysisCallback = (result: ImageAnalysisResult) => void;
export type ProgressCallback = (message: string, pct: number) => void;

// ---- 工具类 ----

export class ImageAnalysisTool implements MapTool {
  readonly id = 'image-analysis';
  readonly name = '卫星图分析';
  readonly icon = '🛰️';
  readonly category = 'visualization' as const;
  readonly exclusive = true;
  readonly description = '截取当前视口卫星影像，分析植被/水体/建筑占比';

  private active = false;
  private ctx: ToolContext | null = null;

  // callbacks
  private _onResult: ImageAnalysisCallback | null = null;
  private _onProgress: ProgressCallback | null = null;

  // ---- callbacks setup ----

  setOnResult(cb: ImageAnalysisCallback | null): void {
    this._onResult = cb;
  }

  setOnProgress(cb: ProgressCallback | null): void {
    this._onProgress = cb;
  }

  private notifyResult(result: ImageAnalysisResult): void {
    this._onResult?.(result);
  }

  private notifyProgress(msg: string, pct: number): void {
    this._onProgress?.(msg, pct);
  }

  // ---- 像素分类启发式 ----

  private classifyPixel(r: number, g: number, b: number): 'vegetation' | 'water' | 'building' | 'other' {
    // 植被：绿色通道主导，且整体不过暗
    if (g > r * 0.85 && g > b * 0.7 && g > 40) {
      return 'vegetation';
    }

    // 水体：蓝色通道主导
    if (b > r * 1.1 && b > g * 1.0 && b > 50) {
      return 'water';
    }

    // 建筑/城区：近灰色（RGB 接近），中等亮度，排除过亮/过暗
    const range = Math.max(r, g, b) - Math.min(r, g, b);
    if (range < 30 && r > 60 && r < 220 && g > 60 && g < 220 && b > 60 && b < 220) {
      return 'building';
    }

    return 'other';
  }

  // ---- 核心分析 ----

  async analyze(): Promise<ImageAnalysisResult> {
    const engine = this.ctx?.engine;
    if (!engine) {
      throw new Error('引擎未就绪');
    }

    this.notifyProgress('正在截取视口影像…', 0);

    // 1. 截取视口
    const blob = await engine.captureViewport();
    this.notifyProgress('正在解码影像…', 15);

    // 2. 创建 ImageBitmap
    const bitmap = await createImageBitmap(blob);
    this.notifyProgress('正在分析像素…', 30);

    // 3. 绘制到 canvas 并读取像素
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) {
      bitmap.close();
      throw new Error('无法创建 2D 上下文');
    }

    ctx2d.drawImage(bitmap, 0, 0);
    const imageData = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data; // Uint8ClampedArray [R,G,B,A, R,G,B,A, ...]
    const totalPixels = canvas.width * canvas.height;

    bitmap.close();

    // 4. 逐像素分类
    let vegetation = 0;
    let water = 0;
    let building = 0;
    let other = 0;

    const step = Math.max(1, Math.floor(totalPixels / 100)); // 每 1% 回调一次
    let lastPct = 0;

    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      // 跳过 alpha（offset + 3）

      const cls = this.classifyPixel(r, g, b);
      switch (cls) {
        case 'vegetation': vegetation++; break;
        case 'water': water++; break;
        case 'building': building++; break;
        default: other++; break;
      }

      // 进度回调（每 1%）
      const pct = Math.round((i / totalPixels) * 100);
      if (i % step === 0 && pct > lastPct) {
        lastPct = pct;
        this.notifyProgress(`正在分析像素… ${pct}%`, 30 + Math.round(pct * 0.65));
      }
    }

    this.notifyProgress('分析完成', 100);

    const result: ImageAnalysisResult = { vegetation, water, building, other, totalPixels };
    this.notifyResult(result);
    return result;
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
  }

  deactivate(): void {
    this.active = false;
    this.ctx = null;
    this._onResult = null;
    this._onProgress = null;
  }

  isActive(): boolean {
    return this.active;
  }
}
