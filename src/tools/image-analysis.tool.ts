import type * as maplibregl from 'maplibre-gl';
import type { MapTool, ToolContext } from '../core/tools';

// ---- 分析结果 ----

export interface ImageAnalysisResult {
  vegetation: number; // 植被像素数
  water: number;      // 水体像素数
  building: number;   // 建筑/城区像素数
  other: number;      // 其他像素数
  totalPixels: number;
  maskCanvas?: HTMLCanvasElement;
  bounds?: [[number, number], [number, number]];
}

export type ImageAnalysisCallback = (result: ImageAnalysisResult) => void;
export type ProgressCallback = (message: string, pct: number) => void;

export type ImageMaskFilter = 'all' | 'vegetation' | 'water' | 'building';

const MASK_SOURCE_ID = 'palm-image-analysis-src';
const MASK_LAYER_ID = 'palm-image-analysis-lyr';

// ---- 工具类 ----

export class ImageAnalysisTool implements MapTool {
  readonly id = 'image-analysis';
  readonly name = '遥感指数分析';
  readonly icon = '🛰️';
  readonly category = 'visualization' as const;
  readonly exclusive = true;
  readonly description = '可见光遥感指数分析 (VARI/NDWI) 并生成分类空间覆层';

  private active = false;
  private ctx: ToolContext | null = null;
  private lastResult: ImageAnalysisResult | null = null;
  private showMask = true;
  private maskOpacity = 0.65;
  private maskFilter: ImageMaskFilter = 'all';

  // callbacks
  private _onResult: ImageAnalysisCallback | null = null;
  private _onProgress: ProgressCallback | null = null;

  get engine() {
    return this.ctx?.engine ?? null;
  }

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

  // ---- 物理遥感指数分类 ----
  // 采用 VARI (Visible Atmospherically Resistant Index) 与可见光水体指数
  private classifyPixel(
    r: number,
    g: number,
    b: number,
  ): 'vegetation' | 'water' | 'building' | 'other' {
    // 1. 水体指数 (NDWI-vis 近似): 强蓝光反射与红光高吸收
    const waterRatio = (b - r) / (b + r + 0.001);
    if (
      (waterRatio > 0.16 && b > 45 && b > g * 0.92) ||
      (b > r * 1.3 && b > g * 1.05 && b > 50)
    ) {
      return 'water';
    }

    // 2. VARI (Visible Atmospherically Resistant Index): (G - R) / (G + R - B)
    // 国际标准可见光植被指数，用于无近红外(NIR)波段的真实卫星影像估算植被盖度
    const variDenominator = g + r - b;
    const vari =
      Math.abs(variDenominator) > 0.001 ? (g - r) / variDenominator : 0;
    if ((vari > 0.12 && g > 45 && g > r * 0.95) || (g > r * 1.15 && g > b * 0.9 && g > 45)) {
      return 'vegetation';
    }

    // 3. 人工建筑 / 硬化地面 (Built-up / Impervious Surface)
    // 建筑混凝土、沥青、瓦屋顶呈现低饱和度、中高反射率特征
    const maxVal = Math.max(r, g, b);
    const minVal = Math.min(r, g, b);
    const saturation = maxVal > 0 ? (maxVal - minVal) / maxVal : 0;
    const brightness = (r + g + b) / 3;

    if (saturation < 0.22 && brightness > 65 && brightness < 225) {
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

    this.notifyProgress('正在截取视口高精度影像…', 0);

    const bounds = engine.getBounds();
    if (!bounds || !Array.isArray(bounds)) {
      throw new Error('无法获取视口地理边界');
    }

    // 1. 截取视口
    const blob = await engine.captureViewport();
    this.notifyProgress('正在解码影像…', 15);

    // 2. 创建 ImageBitmap
    const bitmap = await createImageBitmap(blob);
    this.notifyProgress('正在运行 VARI / NDWI 遥感算法…', 30);

    // 3. 绘制到分析 canvas
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
    const pixels = imageData.data;
    const totalPixels = canvas.width * canvas.height;

    bitmap.close();

    // 4. 构建分类空间掩膜画布 (Mask Canvas)
    const maskCanvas = document.createElement('canvas');
    // 为了性能和纹理平滑，将掩膜适当缩小至不超过 1024 宽度
    const scale = Math.min(1, 1024 / canvas.width);
    maskCanvas.width = Math.round(canvas.width * scale);
    maskCanvas.height = Math.round(canvas.height * scale);
    const maskCtx = maskCanvas.getContext('2d')!;
    const maskImgData = maskCtx.createImageData(maskCanvas.width, maskCanvas.height);

    let vegetation = 0;
    let water = 0;
    let building = 0;
    let other = 0;

    const step = Math.max(1, Math.floor(totalPixels / 100));
    let lastPct = 0;

    // 逐像素分析
    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
      const r = pixels[offset]!;
      const g = pixels[offset + 1]!;
      const b = pixels[offset + 2]!;

      const cls = this.classifyPixel(r, g, b);
      switch (cls) {
        case 'vegetation': vegetation++; break;
        case 'water': water++; break;
        case 'building': building++; break;
        default: other++; break;
      }

      if (i % step === 0) {
        const pct = Math.round((i / totalPixels) * 100);
        if (pct > lastPct) {
          lastPct = pct;
          this.notifyProgress(`正在逐像素分类… ${pct}%`, 30 + Math.round(pct * 0.5));
        }
      }
    }

    this.notifyProgress('正在生成空间分类图层…', 85);

    // 采样填充 mask 像素
    const mW = maskCanvas.width;
    const mH = maskCanvas.height;
    for (let mr = 0; mr < mH; mr++) {
      const srcY = Math.min(canvas.height - 1, Math.floor(mr / scale));
      for (let mc = 0; mc < mW; mc++) {
        const srcX = Math.min(canvas.width - 1, Math.floor(mc / scale));
        const srcOffset = (srcY * canvas.width + srcX) * 4;
        const dstOffset = (mr * mW + mc) * 4;

        const cls = this.classifyPixel(
          pixels[srcOffset]!,
          pixels[srcOffset + 1]!,
          pixels[srcOffset + 2]!,
        );

        if (cls === 'vegetation') {
          maskImgData.data[dstOffset] = 46;     // G
          maskImgData.data[dstOffset + 1] = 204;
          maskImgData.data[dstOffset + 2] = 113;
          maskImgData.data[dstOffset + 3] = 210;
        } else if (cls === 'water') {
          maskImgData.data[dstOffset] = 14;     // B
          maskImgData.data[dstOffset + 1] = 165;
          maskImgData.data[dstOffset + 2] = 233;
          maskImgData.data[dstOffset + 3] = 220;
        } else if (cls === 'building') {
          maskImgData.data[dstOffset] = 249;    // Orange
          maskImgData.data[dstOffset + 1] = 115;
          maskImgData.data[dstOffset + 2] = 22;
          maskImgData.data[dstOffset + 3] = 200;
        } else {
          maskImgData.data[dstOffset + 3] = 0;   // Transparent
        }
      }
    }
    maskCtx.putImageData(maskImgData, 0, 0);

    const result: ImageAnalysisResult = {
      vegetation,
      water,
      building,
      other,
      totalPixels,
      maskCanvas,
      bounds,
    };
    this.lastResult = result;

    // 5. 叠加到地图
    this.renderMaskToMap();
    this.notifyProgress('分析完成并已叠加遥感图层', 100);
    this.notifyResult(result);
    return result;
  }

  // ---- 地图图层控制 ----

  renderMaskToMap(): void {
    if (!this.lastResult?.maskCanvas || !this.lastResult?.bounds || !this.ctx) return;
    const map = this.ctx.engine.getNative() as maplibregl.Map | null;
    if (!map) return;

    if (!this.showMask) {
      this.removeMapLayer();
      return;
    }

    const [[west, south], [east, north]] = this.lastResult.bounds;
    const coordinates: maplibregl.Coordinates = [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ];

    // 若需要根据 filter 过滤类别
    let renderCanvas = this.lastResult.maskCanvas;
    if (this.maskFilter !== 'all') {
      renderCanvas = this.filterMaskCanvas(this.lastResult.maskCanvas, this.maskFilter);
    }

    const imageUrl = renderCanvas.toDataURL();
    const source = map.getSource(MASK_SOURCE_ID) as maplibregl.ImageSource | undefined;
    if (source) {
      source.updateImage({ url: imageUrl, coordinates });
    } else {
      map.addSource(MASK_SOURCE_ID, {
        type: 'image',
        url: imageUrl,
        coordinates,
      });

      map.addLayer({
        id: MASK_LAYER_ID,
        type: 'raster',
        source: MASK_SOURCE_ID,
        paint: {
          'raster-opacity': this.maskOpacity,
          'raster-fade-duration': 150,
          'raster-resampling': 'linear',
        },
      });
    }

    if (map.getLayer(MASK_LAYER_ID)) {
      map.setPaintProperty(MASK_LAYER_ID, 'raster-opacity', this.maskOpacity);
    }
  }

  private filterMaskCanvas(src: HTMLCanvasElement, filter: ImageMaskFilter): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    const imgData = ctx.getImageData(0, 0, c.width, c.height);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i]!;
      const g = d[i + 1]!;
      const b = d[i + 2]!;

      const isVeg = (g > 190 && r < 60);
      const isWater = (b > 200 && r < 30);
      const isBuild = (r > 230 && g < 150);

      let keep = false;
      if (filter === 'vegetation' && isVeg) keep = true;
      else if (filter === 'water' && isWater) keep = true;
      else if (filter === 'building' && isBuild) keep = true;

      if (!keep) d[i + 3] = 0;
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  setMaskVisibility(show: boolean): void {
    this.showMask = show;
    this.renderMaskToMap();
  }

  setMaskOpacity(op: number): void {
    this.maskOpacity = Math.max(0, Math.min(1, op));
    const map = this.ctx?.engine.getNative() as maplibregl.Map | null;
    if (map && map.getLayer(MASK_LAYER_ID)) {
      map.setPaintProperty(MASK_LAYER_ID, 'raster-opacity', this.maskOpacity);
    }
  }

  setMaskFilter(filter: ImageMaskFilter): void {
    this.maskFilter = filter;
    this.renderMaskToMap();
  }

  private removeMapLayer(): void {
    const map = this.ctx?.engine.getNative() as maplibregl.Map | null;
    if (!map) return;
    try {
      if (map.getLayer(MASK_LAYER_ID)) map.removeLayer(MASK_LAYER_ID);
      if (map.getSource(MASK_SOURCE_ID)) map.removeSource(MASK_SOURCE_ID);
    } catch {
      // ignore
    }
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
  }

  deactivate(): void {
    this.removeMapLayer();
    this.active = false;
    this.ctx = null;
    this._onResult = null;
    this._onProgress = null;
    this.lastResult = null;
  }

  isActive(): boolean {
    return this.active;
  }
}

