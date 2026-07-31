// core/terrain.ts — 地形分析共享工具
// 纯函数，不依赖任何引擎实现。所有 DEM 查询通过参数注入。

import type { LngLat } from './types';
import type { Feature, Polygon } from 'geojson';

// ---- 类型 ----

/** 单点高程采样 */
export interface ElevationSample {
  /** 沿路径累计距离 (m) */
  distance: number;
  /** 该点高程 (m)，null 表示查询失败 */
  elevation: number | null;
  /** 该点坐标 */
  coordinate: LngLat;
}

/** 完整高程剖面 */
export interface ElevationProfile {
  samples: ElevationSample[];
  totalDistance: number;
  /** 有效高程点（排除 null） */
  get validSamples(): ElevationSample[];
}

/** 爬升分析统计 */
export interface ClimbStats {
  /** 总爬升 (m) */
  totalClimb: number;
  /** 总下降 (m) */
  totalDescent: number;
  /** 净变化 (m) */
  netChange: number;
  /** 最大坡度 (角度) */
  maxSlopeDeg: number;
  /** 平均坡度 (%) */
  avgSlopePercent: number;
  /** 难度评级 */
  difficulty: '平缓' | '中等' | '挑战' | '极限';
  /** 路径总长 (km) */
  totalDistanceKm: number;
  /** 最高点海拔 (m) */
  maxElevation: number;
  /** 最低点海拔 (m) */
  minElevation: number;
}

/** DEM 格网 */
export interface DEMGrid {
  /** 数据 [row][col]，从西北角开始 */
  data: number[][];
  /** 左上角坐标 */
  northwest: LngLat;
  /** 每个格网单元的经纬度尺寸 */
  cellSize: { lng: number; lat: number };
  /** 格网行列数 */
  rows: number;
  cols: number;
}

// ---- 路径采样 ----

/**
 * 沿路径做等距采样，返回采样点坐标列表
 * 用 Haversine 公式计算累计距离
 */
export function generateSamplePoints(
  path: LngLat[],
  intervalMeters = 30,
): LngLat[] {
  if (path.length < 2) return path;

  const samples: LngLat[] = [path[0]];
  let accumulated = 0;
  let nextSampleDist = intervalMeters;

  for (let i = 1; i < path.length; i++) {
    const segDist = haversineDistance(path[i - 1], path[i]);
    // 在当前段上放置采样点
    while (accumulated + segDist >= nextSampleDist) {
      const remainDist = nextSampleDist - accumulated;
      const t = remainDist / segDist;
      const pt = interpolateLngLat(path[i - 1], path[i], t);
      samples.push(pt);
      nextSampleDist += intervalMeters;
    }

    accumulated += segDist;

    // 最后一个点是路径终点
    if (i === path.length - 1) {
      samples.push(path[i]);
    }
  }

  return samples;
}

/**
 * 从采样点坐标和高程数组构建 ElevationProfile
 */
export function buildProfile(
  samplePoints: LngLat[],
  elevations: (number | null)[],
): ElevationProfile {
  if (samplePoints.length !== elevations.length) {
    throw new Error('采样点与高程数组长度不一致');
  }

  const samples: ElevationSample[] = [];
  let totalDistance = 0;

  for (let i = 0; i < samplePoints.length; i++) {
    if (i > 0) {
      totalDistance += haversineDistance(samplePoints[i - 1], samplePoints[i]);
    }
    samples.push({
      distance: totalDistance,
      elevation: elevations[i],
      coordinate: samplePoints[i],
    });
  }

  // 计算 validSamples 作为 getter
  const validSamples: ElevationSample[] = samples.filter(
    (s) => s.elevation !== null,
  );

  return {
    samples,
    totalDistance,
    get validSamples() {
      return validSamples;
    },
  };
}

// ---- 爬升分析 ----

/**
 * 从高程数组计算爬升统计
 * @param elevations 有效高程数组 (m)，不含 null
 * @param profile ElevationProfile 用于获取段长
 */
export function computeClimbStats(
  profile: ElevationProfile,
): ClimbStats {
  const valid = profile.validSamples;
  if (valid.length < 2) {
    return {
      totalClimb: 0, totalDescent: 0, netChange: 0,
      maxSlopeDeg: 0, avgSlopePercent: 0,
      difficulty: '平缓',
      totalDistanceKm: profile.totalDistance / 1000,
      maxElevation: valid[0]?.elevation ?? 0,
      minElevation: valid[0]?.elevation ?? 0,
    };
  }

  let totalClimb = 0;
  let totalDescent = 0;
  let maxSlopeDeg = 0;
  let maxEl = valid[0].elevation!;
  let minEl = valid[0].elevation!;

  for (let i = 1; i < valid.length; i++) {
    const dh = valid[i].elevation! - valid[i - 1].elevation!;
    const dd = valid[i].distance - valid[i - 1].distance;

    if (dh > 0) totalClimb += dh;
    else totalDescent += Math.abs(dh);

    if (dd > 0) {
      const slopeDeg = Math.atan(Math.abs(dh) / dd) * (180 / Math.PI);
      if (slopeDeg > maxSlopeDeg) maxSlopeDeg = slopeDeg;
    }

    if (valid[i].elevation! > maxEl) maxEl = valid[i].elevation!;
    if (valid[i].elevation! < minEl) minEl = valid[i].elevation!;
  }

  const netChange = valid[valid.length - 1].elevation! - valid[0].elevation!;
  const avgSlopePercent =
    profile.totalDistance > 0
      ? (totalClimb / profile.totalDistance) * 100
      : 0;

  // 难度评级
  let difficulty: ClimbStats['difficulty'] = '平缓';
  if (avgSlopePercent >= 15 || maxSlopeDeg >= 45) difficulty = '极限';
  else if (avgSlopePercent >= 8 || maxSlopeDeg >= 30) difficulty = '挑战';
  else if (avgSlopePercent >= 3) difficulty = '中等';

  return {
    totalClimb: Math.round(totalClimb),
    totalDescent: Math.round(totalDescent),
    netChange: Math.round(netChange),
    maxSlopeDeg: Math.round(maxSlopeDeg * 10) / 10,
    avgSlopePercent: Math.round(avgSlopePercent * 10) / 10,
    difficulty,
    totalDistanceKm: Math.round(profile.totalDistance / 100) / 10,
    maxElevation: Math.round(maxEl),
    minElevation: Math.round(minEl),
  };
}

// ---- 海平面淹没 ----

/**
 * 对 DEM 格网应用海平面上升，返回淹没二值格网
 * @param grid DEM 格网
 * @param waterLevel 水位高度 (m)
 * @returns 淹没格网: true = 被淹没
 */
export function computeFloodMask(grid: DEMGrid, waterLevel: number): boolean[][] {
  const mask: boolean[][] = [];
  for (let r = 0; r < grid.rows; r++) {
    mask[r] = [];
    for (let c = 0; c < grid.cols; c++) {
      mask[r][c] = grid.data[r][c] < waterLevel;
    }
  }
  return mask;
}

// ---- 地理计算工具 ----

/** Haversine 距离 (m) */
export function haversineDistance(a: LngLat, b: LngLat): number {
  const R = 6_371_000; // 地球半径 (m)
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aVal =
    sinDLat * sinDLat +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

/** 线性插值两点之间的坐标 */
export function interpolateLngLat(
  a: LngLat,
  b: LngLat,
  t: number,
): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// ---- 坡度/坡向分析 (Horn 1981) ----

const METERS_PER_DEG_LAT = 111_320;

/** 坡度/坡向计算结果 */
export interface SlopeAspectGrid {
  slopeDeg: Float32Array;    // [row*cols+col] 坡度角度
  aspectDeg: Float32Array;   // [row*cols+col] 坡向角度，0°=北顺时针，-1=平坦
  rows: number;
  cols: number;
  /** 格网经纬度范围 [west, south, east, north] */
  bounds: [number, number, number, number];
}

/**
 * Horn (1981) 3×3 梯度卷积 — 坡度/坡向
 *
 * @param data  扁平高程 [row*cols+col]，row 从北→南，col 从西→东
 * @param noDataValue  无效高程标记
 * @param centerLatDeg  格网中心纬度（用于米制转换）
 */
export function computeSlopeAspect(
  data: Float32Array,
  rows: number,
  cols: number,
  cellSizeLng: number,
  cellSizeLat: number,
  noDataValue: number,
  centerLatDeg: number,
): { slopeDeg: Float32Array; aspectDeg: Float32Array } {
  const slopeDeg = new Float32Array(rows * cols);
  const aspectDeg = new Float32Array(rows * cols);

  const cosLat = Math.cos((centerLatDeg * Math.PI) / 180);
  const dxM = cellSizeLng * METERS_PER_DEG_LAT * cosLat;
  const dyM = cellSizeLat * METERS_PER_DEG_LAT;
  const denomX = 8 * dxM;
  const denomY = 8 * dyM;

  const idx = (r: number, c: number) => r * cols + c;

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const nw = data[idx(r - 1, c - 1)];
      const nn = data[idx(r - 1, c)];
      const ne = data[idx(r - 1, c + 1)];
      const ww = data[idx(r, c - 1)];
      const ee = data[idx(r, c + 1)];
      const sw = data[idx(r + 1, c - 1)];
      const ss = data[idx(r + 1, c)];
      const se = data[idx(r + 1, c + 1)];

      const neighbors = [nw, nn, ne, ww, ee, sw, ss, se];
      if (neighbors.some((v) => v === noDataValue || !Number.isFinite(v))) {
        slopeDeg[idx(r, c)] = 0;
        aspectDeg[idx(r, c)] = -1;
        continue;
      }

      const dzDx = (ne + 2 * ee + se - nw - 2 * ww - sw) / denomX;
      const dzDy = (ne + 2 * nn + nw - se - 2 * ss - sw) / denomY;

      const slopeRad = Math.atan(Math.sqrt(dzDx * dzDx + dzDy * dzDy));
      slopeDeg[idx(r, c)] = Math.round(slopeRad * (180 / Math.PI) * 10) / 10;

      if (Math.abs(dzDx) < 1e-9 && Math.abs(dzDy) < 1e-9) {
        aspectDeg[idx(r, c)] = -1;
      } else {
        let a = Math.atan2(-dzDy, -dzDx) * (180 / Math.PI);
        if (a < 0) a += 360;
        aspectDeg[idx(r, c)] = Math.round(a);
      }
    }
  }

  return { slopeDeg, aspectDeg };
}

// ---- 渲染色阶 ----

/** 根据坡度角度返回 RGBA 颜色 */
export function slopeColor(deg: number): [number, number, number, number] {
  if (deg <= 0) return [34, 139, 34, 200];   // 深绿
  if (deg <= 5) return [104, 187, 89, 200];  // 浅绿
  if (deg <= 15) return [220, 220, 50, 200]; // 黄
  if (deg <= 30) return [245, 150, 40, 200]; // 橙
  if (deg <= 45) return [220, 60, 40, 220];  // 红
  return [160, 30, 30, 230];                  // 深红 (45°+)
}

/**
 * 坡向 → RGBA（8 方向分类）
 * 0°=北, 顺时针: N/NE/E/SE/S/SW/W/NW
 */
export function aspectColor(deg: number): [number, number, number, number] {
  if (deg < 0) return [80, 80, 80, 80];      // 平坦 = 灰
  // 每 45° 一个方向，偏移 22.5° 居中
  const sectors: [number, number, number, number][] = [
    [60, 100, 220, 200],   // N   蓝
    [40, 180, 200, 200],   // NE  青
    [40, 180, 80, 200],    // E   绿
    [180, 200, 60, 200],   // SE  黄绿
    [220, 200, 50, 200],   // S   黄
    [240, 140, 50, 200],   // SW  橙
    [230, 80, 60, 200],    // W   红
    [190, 80, 210, 200],   // NW  紫
  ];
  const idx = Math.floor(((deg + 22.5) % 360) / 45);
  return sectors[idx]!;
}

/**
 * 将坡度格网渲染为 ImageData（用于 ImageSource）
 * 无效格网保持透明
 */
export function renderSlopeImageData(
  slopeDeg: Float32Array,
  rows: number,
  cols: number,
): ImageData {
  const img = new ImageData(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = (r * cols + c) * 4;
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) continue;
      const deg = slopeDeg[r * cols + c];
      const [rr, gg, bb, aa] = slopeColor(deg);
      img.data[px] = rr;
      img.data[px + 1] = gg;
      img.data[px + 2] = bb;
      img.data[px + 3] = aa;
    }
  }
  return img;
}

/**
 * 将坡向格网渲染为 ImageData（用于 ImageSource）
 * 平坦区域用灰色
 */
export function renderAspectImageData(
  aspectDeg: Float32Array,
  rows: number,
  cols: number,
): ImageData {
  const img = new ImageData(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = (r * cols + c) * 4;
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) continue;
      const deg = aspectDeg[r * cols + c];
      const [rr, gg, bb, aa] = aspectColor(deg);
      img.data[px] = rr;
      img.data[px + 1] = gg;
      img.data[px + 2] = bb;
      img.data[px + 3] = aa;
    }
  }
  return img;
}

// ---- 通视分析 (horizon line) ----

/**
 * Horizon line 通视分析结果
 * 以视点为中心，每个格网标记 1=可见, 0=不可见, -1=无效
 */
export interface ViewshedResult {
  /** 可见性格网 [row*cols+col]，1=可见, 0=遮挡, -1=无数据/边界外 */
  visibility: Float32Array;
  rows: number;
  cols: number;
  /** 视点在格网中的行列 */
  viewRow: number;
  viewCol: number;
  /** 经纬度范围 [west, south, east, north] */
  bounds: [number, number, number, number];
}

/**
 * Horizon line 通视计算
 *
 * 从视点出发，沿 360 个方位角的射线做 horizon line 追踪。
 *
 * @param data      扁平高程 [row*cols+col]，行北→南，列西→东
 * @param noData    无效高程标记
 * @param cellSizeM 格网单元米制尺寸
 * @param viewRow   视点所在行
 * @param viewCol   视点所在列
 * @param observerH 观察者离地高度 (m)
 * @returns 可见性格网
 */
export function computeViewshed(
  data: Float32Array,
  rows: number,
  cols: number,
  cellSizeM: number,
  viewRow: number,
  viewCol: number,
  observerH: number,
  noData: number,
): Float32Array {
  const visibility = new Float32Array(rows * cols);
  visibility.fill(-1);

  const viewEl = data[viewRow * cols + viewCol];
  if (viewEl === noData) return visibility;

  const viewH = viewEl + observerH;

  const NUM_AZIMUTHS = 360;
  const radPerAzimuth = (Math.PI * 2) / NUM_AZIMUTHS;
  const maxR = Math.max(rows, cols);

  /**
   * Bresenham 直线遍历：从 (c0, r0) 到 (c1, r1)，返回沿途所有格网坐标。
   * 替换原来的 Math.round 步进，确保每个方位角射线穿过的所有格网都被访问。
   */
  function bresenhamCells(
    c0: number, r0: number, c1: number, r1: number,
  ): Array<[col: number, row: number, pixels: number]> {
    const cells: Array<[number, number, number]> = [];
    const dx = Math.abs(c1 - c0);
    const dy = Math.abs(r1 - r0);
    const sx = c0 < c1 ? 1 : -1;
    const sy = r0 < r1 ? 1 : -1;
    let err = dx - dy;
    let c = c0;
    let r = r0;
    let step = 0;

    while (true) {
      cells.push([c, r, step]);
      if (c === c1 && r === r1) break;
      step++;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; c += sx; }
      if (e2 < dx)  { err += dx; r += sy; }
    }
    return cells;
  }

  const idx = (r: number, c: number) => r * cols + c;

  for (let a = 0; a < NUM_AZIMUTHS; a++) {
    const angle = a * radPerAzimuth;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // 射线与格网边界的交点
    const endCol = Math.round(viewCol + maxR * cosA);
    const endRow = Math.round(viewRow - maxR * sinA);

    const line = bresenhamCells(viewCol, viewRow, endCol, endRow);
    let horizon = -Infinity;

    // 跳过视点本身 (line[0])
    for (let i = 1; i < line.length; i++) {
      const [c, r, pixels] = line[i]!;
      if (r < 0 || r >= rows || c < 0 || c >= cols) break;

      const iCell = idx(r, c);
      const el = data[iCell];
      if (el === noData || !Number.isFinite(el)) continue;

      // 真实距离（用 Bresenham 步数近似，最后一步精确）
      const distPixels = i === line.length - 1
        ? Math.sqrt((c - viewCol) ** 2 + (r - viewRow) ** 2)
        : pixels;
      const distM = Math.max(1, distPixels) * cellSizeM;
      const dz = el - viewH;
      const elevAngle = Math.atan2(dz, distM);

      if (elevAngle > horizon) {
        // 可见 — 「一旦可见，始终可见」原则，防止不同射线互相覆盖
        if (visibility[iCell] !== 1) visibility[iCell] = 1;
        horizon = elevAngle;
      } else {
        // 只有尚未被标记时才写入遮挡
        if (visibility[iCell] === -1) visibility[iCell] = 0;
      }
    }
  }

  // 视点本身标记可见
  visibility[idx(viewRow, viewCol)] = 1;

  return visibility;
}

/**
 * 将通视结果渲染为 ImageData（可见=绿, 不可见=红）
 */
export function renderViewshedImageData(
  visibility: Float32Array,
  rows: number,
  cols: number,
): ImageData {
  const img = new ImageData(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = (r * cols + c) * 4;
      const v = visibility[r * cols + c];
      if (v === 1) {
        // 可见 = 绿色
        img.data[px] = 56;
        img.data[px + 1] = 180;
        img.data[px + 2] = 74;
        img.data[px + 3] = 235;
      } else if (v === 0) {
        // 遮挡 = 红色
        img.data[px] = 220;
        img.data[px + 1] = 60;
        img.data[px + 2] = 40;
        img.data[px + 3] = 225;
      }
    }
  }
  return img;
}

// ============================================================
//  v0.6 通视分析增强 — 多观察点 / 信号覆盖 / 雷达扇形 / 互视矩阵
// ============================================================

/** 观察点定义 */
export interface ObserverPoint {
  id: string;
  lng: number;
  lat: number;
  heightM: number;  // 离地观察高度 (m)
}

/** 多观察点合成策略 */
export type MultiObserverStrategy = 'union' | 'intersect' | 'majority';

/** 多观察点合成结果 */
export interface MultiObserverResult {
  visibility: Float32Array;
  perObserver: Float32Array[];
  rows: number;
  cols: number;
  bounds: [number, number, number, number];
  observers: ObserverPoint[];
  strategy: MultiObserverStrategy;
}

/**
 * 多观察点合成通视分析
 * 对 N 个观察点各自计算 viewshed，然后按策略合成。
 * 所有观察点共享同一 DEM 格网。
 */
export function computeMultiObserverViewshed(
  data: Float32Array,
  rows: number,
  cols: number,
  cellSizeM: number,
  bounds: [number, number, number, number],
  observers: ObserverPoint[],
  strategy: MultiObserverStrategy,
  noData: number,
): MultiObserverResult {
  const [west, south, east, north] = bounds;

  const perObserver: Float32Array[] = [];

  for (const obs of observers) {
    const col = Math.round(((obs.lng - west) / (east - west)) * (cols - 1));
    const row = Math.round(((north - obs.lat) / (north - south)) * (rows - 1));

    if (row < 0 || row >= rows || col < 0 || col >= cols) {
      const empty = new Float32Array(rows * cols);
      empty.fill(-1);
      perObserver.push(empty);
      continue;
    }

    const vis = computeViewshed(
      data, rows, cols, cellSizeM, row, col, obs.heightM, noData,
    );
    perObserver.push(vis);
  }

  // 合成
  const composite = new Float32Array(rows * cols);
  composite.fill(-1);

  for (let i = 0; i < rows * cols; i++) {
    let visible = 0;
    let valid = 0;
    for (const pv of perObserver) {
      if (pv[i] >= 0) {
        valid++;
        if (pv[i] === 1) visible++;
      }
    }
    if (valid === 0) { composite[i] = -1; continue; }

    switch (strategy) {
      case 'union':
        composite[i] = visible > 0 ? 1 : 0;
        break;
      case 'intersect':
        composite[i] = visible === valid ? 1 : 0;
        break;
      case 'majority':
        composite[i] = visible / valid; // K/N 覆盖率 (0→1)
        break;
    }
  }

  return { visibility: composite, perObserver, rows, cols, bounds, observers, strategy };
}

/** 覆盖率 (0→1) → RGB（红→黄→绿） */
function _coverageColor(coverage: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, coverage));
  if (t < 0.5) {
    const s = t * 2;
    return [Math.round(220), Math.round(60 + s * 195), Math.round(40)];
  }
  const s = (t - 0.5) * 2;
  return [Math.round(220 - s * 164), Math.round(255 - s * 75), Math.round(40 + s * 34)];
}

/**
 * 多观察点合成 → ImageData
 * union/intersect: 绿/红二值；majority: 覆盖率热力色阶
 */
export function renderMultiObserverImageData(result: MultiObserverResult): ImageData {
  const { visibility, rows, cols, strategy } = result;
  const img = new ImageData(cols, rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = (r * cols + c) * 4;
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) continue;
      const v = visibility[r * cols + c];
      if (v < 0) continue;

      if (strategy === 'majority') {
        const [rr, gg, bb] = _coverageColor(v);
        img.data[px] = rr; img.data[px + 1] = gg; img.data[px + 2] = bb;
        img.data[px + 3] = 220;
      } else if (v === 1) {
        img.data[px] = 56; img.data[px + 1] = 180; img.data[px + 2] = 74;
        img.data[px + 3] = 235;
      } else {
        img.data[px] = 220; img.data[px + 1] = 60; img.data[px + 2] = 40;
        img.data[px + 3] = 225;
      }
    }
  }
  return img;
}

// ---- 信号覆盖热力 (RF Propagation) ----

/** 信号覆盖参数 */
export interface SignalCoverageParams {
  frequencyMHz: number;
  powerDBm: number;
  antennaHeightM: number;
  azimuthDeg?: number;
  beamWidthDeg?: number;
}

/** 信号覆盖结果 */
export interface SignalCoverageResult {
  rssi: Float32Array;
  rows: number;
  cols: number;
  bounds: [number, number, number, number];
  params: SignalCoverageParams;
}

/**
 * 信号覆盖热力计算
 * 基于 viewshed 的地形遮挡 + FSPL 自由空间路径损耗。
 * FSPL = 20·log₁₀(d_km) + 20·log₁₀(f_MHz) + 32.45
 * 遮挡 → -Infinity（无信号）
 */
export function computeSignalCoverage(
  data: Float32Array,
  rows: number,
  cols: number,
  cellSizeM: number,
  bounds: [number, number, number, number],
  observer: ObserverPoint,
  params: SignalCoverageParams,
  noData: number,
): SignalCoverageResult {
  const [west, south, east, north] = bounds;
  const col = Math.round(((observer.lng - west) / (east - west)) * (cols - 1));
  const row = Math.round(((north - observer.lat) / (north - south)) * (rows - 1));

  const viewshed = computeViewshed(
    data, rows, cols, cellSizeM, row, col, params.antennaHeightM, noData,
  );

  const centerLat = (north + south) / 2;
  const metersPerDegLat = 111_320;
  const metersPerDegLng = metersPerDegLat * Math.cos((centerLat * Math.PI) / 180);
  const dLat = (north - south) / (rows - 1);
  const dLng = (east - west) / (cols - 1);

  const rssi = new Float32Array(rows * cols);
  rssi.fill(NaN);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const vis = viewshed[idx];
      if (vis < 0) { rssi[idx] = NaN; continue; }

      // 距离
      const dLatDeg = (r - row) * dLat;
      const dLngDeg = (c - col) * dLng;
      const dKm = Math.sqrt((dLatDeg * metersPerDegLat) ** 2 + (dLngDeg * metersPerDegLng) ** 2) / 1000;

      // 扇形检查
      if (params.beamWidthDeg && params.beamWidthDeg < 360 && params.azimuthDeg !== undefined) {
        const dx = (c - col) * dLng * metersPerDegLng;
        const dy = -(r - row) * dLat * metersPerDegLat;
        const bearingToCell = (Math.atan2(dx, dy) * 180) / Math.PI;
        let diff = bearingToCell - params.azimuthDeg;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        if (Math.abs(diff) > params.beamWidthDeg / 2) { rssi[idx] = NaN; continue; }
      }

      if (vis === 0) { rssi[idx] = -Infinity; continue; }

      const fspl = dKm < 0.001 ? 0 : 20 * Math.log10(dKm) + 20 * Math.log10(params.frequencyMHz) + 32.45;
      rssi[idx] = params.powerDBm - fspl;
    }
  }

  return { rssi, rows, cols, bounds, params };
}

/** 信号覆盖 → ImageData（RSSI 阈值分段着色） */
export function renderSignalCoverageImageData(result: SignalCoverageResult): ImageData {
  const { rssi, rows, cols } = result;
  const img = new ImageData(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = (r * cols + c) * 4;
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) continue;
      const v = rssi[r * cols + c];
      if (Number.isNaN(v)) continue;
      if (v === -Infinity) {
        img.data[px] = 160; img.data[px + 1] = 30; img.data[px + 2] = 30; img.data[px + 3] = 120;
      } else if (v >= -70) {
        img.data[px] = 56; img.data[px + 1] = 180; img.data[px + 2] = 74; img.data[px + 3] = 230;
      } else if (v >= -85) {
        img.data[px] = 220; img.data[px + 1] = 200; img.data[px + 2] = 50; img.data[px + 3] = 220;
      } else if (v >= -100) {
        img.data[px] = 245; img.data[px + 1] = 140; img.data[px + 2] = 40; img.data[px + 3] = 200;
      } else {
        img.data[px] = 200; img.data[px + 1] = 50; img.data[px + 2] = 40; img.data[px + 3] = 140;
      }
    }
  }
  return img;
}

// ---- 雷达扇形可视域 ----

/** 雷达扇形结果 */
export interface RadarSectorResult {
  visibility: Float32Array;
  rows: number;
  cols: number;
  bounds: [number, number, number, number];
  observer: ObserverPoint;
  azimuthDeg: number;
  beamWidthDeg: number;
  radiusKm: number;
}

/**
 * 雷达扇形可视域
 * 在 single-point viewshed 上限制方位角 + 开角 + 最大半径。
 */
export function computeRadarSectorViewshed(
  data: Float32Array,
  rows: number,
  cols: number,
  cellSizeM: number,
  bounds: [number, number, number, number],
  observer: ObserverPoint,
  azimuthDeg: number,
  beamWidthDeg: number,
  radiusKm: number,
  noData: number,
): RadarSectorResult {
  const [west, south, east, north] = bounds;
  const col = Math.round(((observer.lng - west) / (east - west)) * (cols - 1));
  const row = Math.round(((north - observer.lat) / (north - south)) * (rows - 1));

  const fullVis = computeViewshed(data, rows, cols, cellSizeM, row, col, observer.heightM, noData);

  const sectorVis = new Float32Array(rows * cols);
  sectorVis.fill(-1);
  const maxRadiusPixels = (radiusKm * 1000) / cellSizeM;
  const centerLat = (north + south) / 2;
  const metersPerDegLng = 111_320 * Math.cos((centerLat * Math.PI) / 180);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (fullVis[idx] < 0) continue;

      const dr = r - row;
      const dc = c - col;
      const distPixels = Math.sqrt(dr * dr + dc * dc);
      if (distPixels > maxRadiusPixels) continue;

      if (beamWidthDeg < 360) {
        const dx = dc * metersPerDegLng;
        const dy = -dr * 111_320;
        const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
        let diff = bearing - azimuthDeg;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        if (Math.abs(diff) > beamWidthDeg / 2) continue;
      }

      sectorVis[idx] = fullVis[idx];
    }
  }
  if (row >= 0 && row < rows && col >= 0 && col < cols) sectorVis[row * cols + col] = 1;

  return { visibility: sectorVis, rows, cols, bounds, observer, azimuthDeg, beamWidthDeg, radiusKm };
}

/** 生成扇形边框 GeoJSON Polygon */
export function buildSectorPolygon(
  observer: ObserverPoint,
  azimuthDeg: number,
  beamWidthDeg: number,
  radiusKm: number,
  numPoints = 64,
): Feature<Polygon> {
  const [lng, lat] = [observer.lng, observer.lat];
  const degPerM = 1 / 111_320;
  const rDeg = radiusKm * 1000 * degPerM;
  const rDegLng = rDeg / Math.cos((lat * Math.PI) / 180);
  const halfWidth = beamWidthDeg / 2;
  const coords: number[][] = [[lng, lat]];
  for (let i = 0; i <= numPoints; i++) {
    const a = azimuthDeg - halfWidth + (beamWidthDeg * i) / numPoints;
    const rad = (a * Math.PI) / 180;
    coords.push([lng + rDegLng * Math.sin(rad), lat + rDeg * Math.cos(rad)]);
  }
  coords.push([lng, lat]);
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  };
}

/** 雷达扇形可视域 → ImageData */
export function renderRadarSectorImageData(
  visibility: Float32Array,
  rows: number,
  cols: number,
): ImageData {
  const img = new ImageData(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = (r * cols + c) * 4;
      const v = visibility[r * cols + c];
      if (v === 1) {
        img.data[px] = 56; img.data[px + 1] = 180; img.data[px + 2] = 74; img.data[px + 3] = 235;
      } else if (v === 0) {
        img.data[px] = 220; img.data[px + 1] = 60; img.data[px + 2] = 40; img.data[px + 3] = 200;
      }
    }
  }
  return img;
}

// ---- 多点互视矩阵 (Inter-Visibility Matrix) ----

/** 两点间互视结果 */
export interface PairVisibility {
  from: string;
  to: string;
  visible: boolean;
  maxElevationAngle: number;
  distanceM: number;
}

/** 互视矩阵结果 */
export interface InterVisibilityResult {
  observers: ObserverPoint[];
  matrix: (PairVisibility | null)[][];
  visibleCounts: number[];
}

/**
 * 多点互视矩阵
 * 对每对观察点沿大圆路径采样 DEM 判定视线遮挡。
 */
export function computeInterVisibilityMatrix(
  observers: ObserverPoint[],
  queryElevation: (lng: number, lat: number) => number | null,
): InterVisibilityResult {
  const n = observers.length;
  const matrix: (PairVisibility | null)[][] = Array.from({ length: n }, () =>
    Array.from<PairVisibility | null>({ length: n }).fill(null),
  );
  const visibleCounts = Array.from<number>({ length: n }).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const src = observers[i]!;
      const dst = observers[j]!;

      const dist = haversineDistance([src.lng, src.lat], [dst.lng, dst.lat]);
      const numSamples = Math.max(2, Math.ceil(dist / 30));

      let maxElevAngle = -Infinity;
      let blocked = false;

      const srcEl = queryElevation(src.lng, src.lat);
      const dstEl = queryElevation(dst.lng, dst.lat);
      if (srcEl === null || dstEl === null) continue;

      const srcH = srcEl + src.heightM;
      const dstH = dstEl + dst.heightM;

      for (let k = 1; k < numSamples; k++) {
        const t = k / numSamples;
        const midLng = src.lng + (dst.lng - src.lng) * t;
        const midLat = src.lat + (dst.lat - src.lat) * t;
        const midEl = queryElevation(midLng, midLat);
        if (midEl === null) continue;

        const d = dist * t;
        const elevAngle = Math.atan2(midEl - srcH, d);
        if (elevAngle > maxElevAngle) maxElevAngle = elevAngle;

        const dstElevAngle = Math.atan2(dstH - srcH, dist);
        if (elevAngle > dstElevAngle + 0.001) { blocked = true; break; }
      }

      const result: PairVisibility = {
        from: src.id, to: dst.id, visible: !blocked,
        maxElevationAngle: maxElevAngle, distanceM: dist,
      };
      matrix[i]![j] = result;
      matrix[j]![i] = { ...result, from: dst.id, to: src.id };
      if (!blocked) { visibleCounts[i]!++; visibleCounts[j]!++; }
    }
  }

  return { observers, matrix, visibleCounts };
}
