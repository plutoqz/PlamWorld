// core/hydrology.ts — 地表水文分析纯函数
// D8 流向 / 流量累积 / 流域划分 / TWI 地形湿度指数
// 所有计算为纯函数，不依赖任何 DOM 或引擎 API，可直接放 Worker 运行

// ---- D8 流向编码 ----

/** D8 流向：8 个方向按 2 的幂编码 */
export const D8_DIRECTIONS = [
  { code: 1, dc: 1, dr: 0 },   // E
  { code: 2, dc: 1, dr: 1 },   // SE
  { code: 4, dc: 0, dr: 1 },   // S
  { code: 8, dc: -1, dr: 1 },  // SW
  { code: 16, dc: -1, dr: 0 }, // W
  { code: 32, dc: -1, dr: -1 },// NW
  { code: 64, dc: 0, dr: -1 }, // N
  { code: 128, dc: 1, dr: -1 },// NE
] as const;

// ---- 填洼 (Fill Sinks) ----

/**
 * 平面填洼：将洼地填平到周围最低溢出点高程
 * 简化版 — 对每个格网检查是否有更低邻域可流出，无则抬高
 */
export function fillSinksFlat(
  dem: Float32Array,
  cols: number,
  rows: number,
): Float32Array {
  const filled = new Float32Array(dem);

  function idx(c: number, r: number): number {
    return r * cols + c;
  }

  function inBounds(c: number, r: number): boolean {
    return c >= 0 && c < cols && r >= 0 && r < rows;
  }

  let changed = true;
  let iterations = 0;
  const maxIterations = cols * rows; // safety limit

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = idx(c, r);
        const val = filled[i];

        // Check if this cell is a sink (all neighbors higher or equal)
        let hasLower = false;
        let minNeighbor = Infinity;

        for (const { dc, dr } of D8_DIRECTIONS) {
          const nc = c + dc;
          const nr = r + dr;
          if (!inBounds(nc, nr)) continue;
          const nVal = filled[idx(nc, nr)];
          if (nVal < val) {
            hasLower = true;
            break;
          }
          if (nVal < minNeighbor) minNeighbor = nVal;
        }

        // If sink and not at edge, raise to min neighbor
        if (!hasLower && minNeighbor < Infinity && minNeighbor > val) {
          filled[i] = minNeighbor;
          changed = true;
        }
      }
    }
  }

  return filled;
}

// ---- D8 流向 ----

/**
 * 对填洼后的 DEM 计算 D8 流向
 * 返回 Int8Array，每个格网存储流向编码 (1,2,4,8,16,32,64,128)，0 = 无流向(洼地/边界)
 * 选择 8 邻域中"最陡下降"方向
 */
export function computeD8FlowDirection(
  dem: Float32Array,
  cols: number,
  rows: number,
  cellSize: number,
): Int8Array {
  const flowDir = new Int8Array(cols * rows);

  function idx(c: number, r: number): number {
    return r * cols + c;
  }

  function inBounds(c: number, r: number): boolean {
    return c >= 0 && c < cols && r >= 0 && r < rows;
  }

  const diagDist = cellSize * Math.SQRT2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(c, r);
      const val = dem[i];
      let maxSlope = 0;
      let bestDir = 0;

      for (const { code, dc, dr } of D8_DIRECTIONS) {
        const nc = c + dc;
        const nr = r + dr;
        if (!inBounds(nc, nr)) continue;

        const nVal = dem[idx(nc, nr)];
        const drop = val - nVal;
        if (drop <= 0) continue;

        // Distance: cardinal = cellSize, diagonal = cellSize * sqrt(2)
        const dist = (Math.abs(dc) + Math.abs(dr)) === 2 ? diagDist : cellSize;
        const slope = drop / dist;

        if (slope > maxSlope) {
          maxSlope = slope;
          bestDir = code;
        }
      }

      flowDir[i] = bestDir;
    }
  }

  return flowDir;
}

// ---- 流量累积 ----

/**
 * 从流向图计算流量累积（上游集水格网数）
 * 返回值单位：上游格网数量（含自身）
 */
export function computeFlowAccumulation(
  flowDir: Int8Array,
  cols: number,
  rows: number,
): Float32Array {
  const n = cols * rows;
  const flowAcc = new Float32Array(n).fill(1); // 每个格网初始为 1（自身）
  const indegree = new Int32Array(n);

  function idx(c: number, r: number): number {
    return r * cols + c;
  }

  function inBounds(c: number, r: number): boolean {
    return c >= 0 && c < cols && r >= 0 && r < rows;
  }

  // 反向映射：流向代码 → 目标格网偏移
  const dirToOffset: Record<number, [number, number]> = {};
  for (const { code, dc, dr } of D8_DIRECTIONS) {
    dirToOffset[code] = [dc, dr];
  }

  // 1. 计算入度：对每个格网，它的水流向邻居，邻居入度+1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dir = flowDir[idx(c, r)];
      const offset = dirToOffset[dir];
      if (!offset) continue;
      const nc = c + offset[0];
      const nr = r + offset[1];
      if (inBounds(nc, nr)) {
        indegree[idx(nc, nr)]++;
      }
    }
  }

  // 2. BFS 拓扑排序：入度为 0 的进队列
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (indegree[i] === 0) queue.push(i);
  }

  const order: number[] = [];

  while (queue.length > 0) {
    const i = queue.shift()!;
    order.push(i);

    const c = i % cols;
    const r = Math.floor(i / cols);
    const dir = flowDir[i];
    const offset = dirToOffset[dir];
    if (!offset) continue;

    const nc = c + offset[0];
    const nr = r + offset[1];
    if (inBounds(nc, nr)) {
      const ni = idx(nc, nr);
      indegree[ni]--;
      if (indegree[ni] === 0) queue.push(ni);
    }
  }

  // 3. 按拓扑序累加上游流量
  for (const i of order) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const dir = flowDir[i];
    const offset = dirToOffset[dir];
    if (!offset) continue;

    const nc = c + offset[0];
    const nr = r + offset[1];
    if (inBounds(nc, nr)) {
      const ni = idx(nc, nr);
      flowAcc[ni] += flowAcc[i];
    }
  }

  return flowAcc;
}

// ---- 流域划分 ----

/**
 * 从倾泻点向上游追溯所有流入格网（流域）
 * 返回 Uint8Array 掩码，1 = 流域内
 */
export function delineateWatershed(
  flowDir: Int8Array,
  pourCol: number,
  pourRow: number,
  cols: number,
  rows: number,
): Uint8Array {
  const n = cols * rows;
  const mask = new Uint8Array(n);

  function idx(c: number, r: number): number {
    return r * cols + c;
  }

  function inBounds(c: number, r: number): boolean {
    return c >= 0 && c < cols && r >= 0 && r < rows;
  }

  // 构建反向网络：对每个格网，哪些上游格网流入它
  const reverseDeps = new Map<number, number[]>();
  const dirToOffset: Record<number, [number, number]> = {};
  for (const { code, dc, dr } of D8_DIRECTIONS) {
    dirToOffset[code] = [dc, dr];
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(c, r);
      const dir = flowDir[i];
      const offset = dirToOffset[dir];
      if (!offset) continue;
      const nc = c + offset[0];
      const nr = r + offset[1];
      if (inBounds(nc, nr)) {
        const ni = idx(nc, nr);
        if (!reverseDeps.has(ni)) reverseDeps.set(ni, []);
        reverseDeps.get(ni)!.push(i);
      }
    }
  }

  // BFS/DFS 从倾泻点向上游追溯
  const startIdx = idx(pourCol, pourRow);
  if (!inBounds(pourCol, pourRow)) return mask;

  const stack = [startIdx];
  mask[startIdx] = 1;

  while (stack.length > 0) {
    const i = stack.pop()!;
    const upstream = reverseDeps.get(i);
    if (!upstream) continue;

    for (const up of upstream) {
      if (mask[up] === 0) {
        mask[up] = 1;
        stack.push(up);
      }
    }
  }

  return mask;
}

// ---- TWI 地形湿度指数 ----

/**
 * 计算地形湿度指数 TWI = ln(α / tan(β))
 * α = 上游集水面积 (m²)，β = 局部坡度 (弧度)
 * 高 TWI = 湿润区（谷底），低 TWI = 干燥区（山脊）
 *
 * @param flowAcc 流量累积（格网计数，需换算为面积）
 * @param slopeDeg 坡度数组（度），可选。不传则从 DEM 实时计算
 * @param dem DEM 数据，仅 slopeDeg 未提供时使用
 */
export function computeTWI(
  flowAcc: Float32Array,
  cols: number,
  rows: number,
  cellSize: number,
  slopeDeg?: Float32Array,
  dem?: Float32Array,
): Float32Array {
  const n = cols * rows;
  const twi = new Float32Array(n);
  const cellArea = cellSize * cellSize;

  // 如果未提供坡度，从 DEM 计算
  const slopes = slopeDeg ?? computeSlopeDeg(dem!, cols, rows, cellSize);

  for (let i = 0; i < n; i++) {
    const alpha = flowAcc[i] * cellArea;    // m²
    const slopeRad = (slopes[i] * Math.PI) / 180;
    const tanBeta = Math.max(Math.tan(slopeRad), 1e-6); // 避免除零
    twi[i] = Math.log(alpha / tanBeta);
  }

  return twi;
}

// ---- 辅助：从 DEM 计算坡度（度） ----

/**
 * Horn 1981 方法，从 3×3 邻域计算坡度（度）
 */
export function computeSlopeDeg(
  dem: Float32Array,
  cols: number,
  rows: number,
  cellSize: number,
): Float32Array {
  const slopes = new Float32Array(cols * rows);

  function idx(c: number, r: number): number {
    return r * cols + c;
  }

  const dzDxFactor = 1 / (8 * cellSize);
  const dzDyFactor = 1 / (8 * cellSize);

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const z1 = dem[idx(c - 1, r - 1)];
      const z2 = dem[idx(c, r - 1)];
      const z3 = dem[idx(c + 1, r - 1)];
      const z4 = dem[idx(c - 1, r)];
      const z6 = dem[idx(c + 1, r)];
      const z7 = dem[idx(c - 1, r + 1)];
      const z8 = dem[idx(c, r + 1)];
      const z9 = dem[idx(c + 1, r + 1)];

      const dzDx = (z3 + 2 * z6 + z9 - z1 - 2 * z4 - z7) * dzDxFactor;
      const dzDy = (z7 + 2 * z8 + z9 - z1 - 2 * z2 - z3) * dzDyFactor;

      const slopeRad = Math.atan(Math.sqrt(dzDx * dzDx + dzDy * dzDy));
      slopes[idx(c, r)] = (slopeRad * 180) / Math.PI;
    }
  }

  return slopes;
}

// ---- 辅助：流向统计 ----

/** 流向统计（用于调试/可视化） */
export interface HydrologyStats {
  sinkCount: number;
  maxFlowAccumulation: number;
  watershedArea: number; // 格网数
  meanTWI: number;
  maxTWI: number;
  minTWI: number;
}

export function computeHydrologyStats(
  flowDir: Int8Array,
  flowAcc: Float32Array,
  watershedMask: Uint8Array | null,
  twi: Float32Array | null,
): HydrologyStats {
  let sinkCount = 0;
  let maxFlowAcc = 0;
  let watershedCells = 0;
  let twiSum = 0;
  let twiCount = 0;
  let minTWI = Infinity;
  let maxTWI = -Infinity;

  for (let i = 0; i < flowDir.length; i++) {
    if (flowDir[i] === 0) sinkCount++;
    if (flowAcc[i] > maxFlowAcc) maxFlowAcc = flowAcc[i];
  }

  if (watershedMask) {
    for (let i = 0; i < watershedMask.length; i++) {
      if (watershedMask[i] === 1) watershedCells++;
    }
  }

  if (twi) {
    for (let i = 0; i < twi.length; i++) {
      const val = twi[i];
      if (!isFinite(val)) continue;
      twiSum += val;
      twiCount++;
      if (val < minTWI) minTWI = val;
      if (val > maxTWI) maxTWI = val;
    }
  }

  return {
    sinkCount,
    maxFlowAccumulation: maxFlowAcc,
    watershedArea: watershedCells,
    meanTWI: twiCount > 0 ? twiSum / twiCount : 0,
    maxTWI: twiCount > 0 ? maxTWI : 0,
    minTWI: twiCount > 0 ? minTWI : 0,
  };
}
