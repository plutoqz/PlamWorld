// core/pathfinding.ts — A* / Dijkstra 路径规划 + 等时线 (v0.6)
//
// 特性：
//   - A* 最短路径（Haversine 启发式）
//   - Dijkstra 扩展（等时线 / Isochrone）
//   - 高程代价（上坡惩罚、最大坡度过滤）
//   - 路网图构建（从 OSM highway 数据）
//   - 三种出行模式：步行 / 骑行 / 驾车
//
// 纯函数，无副作用，可放 Worker。

// ---- 类型 ----

/** 出行模式 */
export type TravelMode = 'walking' | 'cycling' | 'driving';

/** 路线选项 */
export interface RouteOptions {
  start: [lng: number, lat: number];
  end: [lng: number, lat: number];
  mode: TravelMode;
  /** 是否避免陡坡（默认 true） */
  avoidSteep?: boolean;
  /** 最大允许坡度（度），默认 walking=20, cycling=12, driving=15 */
  maxSlopeDeg?: number;
  /** 高程查询函数：给定 [lng, lat]，返回高程(m) 或 null */
  queryElevation?: (lng: number, lat: number) => number | null;
}

/** 单个路线段 */
export interface RouteSegment {
  coordinates: [lng: number, lat: number][];
  distanceM: number;
  durationMin: number;
  climbM: number;
  descentM: number;
  avgSlopeDeg: number;
}

/** 路线结果 */
export interface RouteResult {
  path: GeoJSON.LineString;
  /** 路径点数组（含经纬度+高程） */
  waypoints: Array<{ lng: number; lat: number; ele: number | null }>;
  totalDistanceKm: number;
  totalDurationMin: number;
  totalClimbM: number;
  totalDescentM: number;
  difficulty: 'easy' | 'moderate' | 'hard' | 'extreme';
  segments: RouteSegment[];
  /** 路径规划数据源：'osrm' 实际道路导航 | 'direct' 直线采样降级 */
  source?: 'osrm' | 'direct';
  /** 路线特色标签（如：推荐·走大路、近道·距离更短、少路口·红绿灯少、平缓·爬升更少） */
  label?: string;
  /** 路线补充描述或对比优势（如：主干道用时短、比推荐少 1.2km、少 15 个路口） */
  labelDesc?: string;
  /** 交叉路口预估数量 */
  intersectionCount?: number;
  /** 转向弯道次数 */
  turnCount?: number;
}

/** 图节点 */
export interface GraphNode {
  id: number;
  lng: number;
  lat: number;
  /** 高程 (m)，null = 未知 */
  ele: number | null;
}

/** 图边 */
export interface GraphEdge {
  from: number;
  to: number;
  /** 距离 (m) */
  distanceM: number;
  /** OSM highway 标签 (可选) */
  highway?: string;
  /** 最大速度限制 km/h (可选) */
  maxSpeedKmh?: number;
}

/** 路线图 */
export interface RouteGraph {
  nodes: Map<number, GraphNode>;
  edges: Map<number, GraphEdge[]>; // nodeId → outgoing edges
  /** 空间索引：将经纬度映射到最近的节点 */
  nearestNode: (lng: number, lat: number) => number | null;
}

// ---- 常量 ----

/** 各模式的默认速度 (km/h) */
export const MODE_SPEEDS: Record<TravelMode, number> = {
  walking: 5,
  cycling: 15,
  driving: 40, // 城市道路平均
};

/** 各模式默认最大坡度 */
export const MODE_MAX_SLOPE: Record<TravelMode, number> = {
  walking: 20,
  cycling: 12,
  driving: 15,
};

/** 上坡惩罚系数（乘以距离权重） */
const UPHILL_PENALTY_FACTOR = 1.5;
/** 坡度阈值：超过此坡度才施加惩罚 */
const PENALTY_SLOPE_THRESHOLD_DEG = 8;

// ---- 几何工具 ----

const EARTH_RADIUS_M = 6_371_000;

/** Haversine 距离 (m) */
export function haversineDistanceM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 方位角 (度, 0=北) */
export function bearingDeg(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const lat1r = (lat1 * Math.PI) / 180;
  const lat2r = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ---- 速度函数 ----

/** 根据 highway 标签推断速度限制 */
export function speedFromHighway(highway: string | undefined): number {
  switch (highway) {
    case 'motorway':
      return 120;
    case 'trunk':
      return 90;
    case 'primary':
      return 70;
    case 'secondary':
      return 55;
    case 'tertiary':
      return 45;
    case 'residential':
      return 30;
    case 'service':
      return 20;
    case 'footway':
    case 'path':
    case 'steps':
      return 5;
    case 'cycleway':
      return 15;
    default:
      return 40;
  }
}

// ---- 成本函数 ----

/** 计算边的通行成本（时间，分钟） */
export function edgeCost(
  edge: GraphEdge,
  fromElev: number | null,
  toElev: number | null,
  mode: TravelMode,
  maxSlopeDeg: number,
): number {
  const speedKmh = edge.maxSpeedKmh ?? MODE_SPEEDS[mode];
  let distanceKm = edge.distanceM / 1000;

  // 高程代价
  if (fromElev !== null && toElev !== null) {
    const dElev = toElev - fromElev;
    const slopeDeg = Math.atan(Math.abs(dElev) / edge.distanceM) * (180 / Math.PI);

    // 超过最大坡度 → 不可通行
    if (slopeDeg > maxSlopeDeg) return Infinity;

    // 上坡惩罚
    if (dElev > 0 && slopeDeg > PENALTY_SLOPE_THRESHOLD_DEG) {
      distanceKm *= UPHILL_PENALTY_FACTOR;
    }
  }

  return (distanceKm / speedKmh) * 60;
}

// ---- A* ----

interface PQEntry {
  nodeId: number;
  cost: number; // g(n)
  heuristic: number; // f(n) = g(n) + h(n)
}

/** 最小堆优先队列 */
class MinHeap {
  private data: PQEntry[] = [];

  get size(): number {
    return this.data.length;
  }

  push(entry: PQEntry): void {
    this.data.push(entry);
    this.siftUp(this.data.length - 1);
  }

  pop(): PQEntry | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[p]!.heuristic <= this.data[i]!.heuristic) break;
      [this.data[p], this.data[i]] = [this.data[i]!, this.data[p]!];
      i = p;
    }
  }

  private siftDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.data[l]!.heuristic < this.data[smallest]!.heuristic) smallest = l;
      if (r < n && this.data[r]!.heuristic < this.data[smallest]!.heuristic) smallest = r;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest]!, this.data[i]!];
      i = smallest;
    }
  }
}

/** A* 寻路 */
export function aStar(graph: RouteGraph, options: RouteOptions): RouteResult | null {
  const { start, end, mode, queryElevation } = options;
  const maxSlope = options.maxSlopeDeg ?? MODE_MAX_SLOPE[mode];

  const startNode = graph.nearestNode(start[0], start[1]);
  const endNode = graph.nearestNode(end[0], end[1]);
  if (startNode === null || endNode === null) return null;
  if (startNode === endNode) return null;

  const openSet = new MinHeap();
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  // 启发式：Haversine 距离 / 最大速度 → 时间 (min)
  const heuristicSpeed = mode === 'walking' ? 5 : mode === 'cycling' ? 15 : 60;
  const h0 =
    (haversineDistanceM(
      graph.nodes.get(startNode)!.lng,
      graph.nodes.get(startNode)!.lat,
      graph.nodes.get(endNode)!.lng,
      graph.nodes.get(endNode)!.lat,
    ) /
      1000 /
      heuristicSpeed) *
    60;

  gScore.set(startNode, 0);
  fScore.set(startNode, h0);
  openSet.push({ nodeId: startNode, cost: 0, heuristic: h0 });

  let found = false;

  while (openSet.size > 0) {
    const current = openSet.pop()!;
    if (current.nodeId === endNode) {
      found = true;
      break;
    }

    const curG = gScore.get(current.nodeId) ?? Infinity;
    if (current.cost > curG) continue;

    const edges = graph.edges.get(current.nodeId) ?? [];
    for (const edge of edges) {
      const fromNode = graph.nodes.get(current.nodeId);
      const toNode = graph.nodes.get(edge.to);
      if (!fromNode || !toNode) continue;

      const fromEle = fromNode.ele ?? queryElevation?.(fromNode.lng, fromNode.lat) ?? null;
      const toEle = toNode.ele ?? queryElevation?.(toNode.lng, toNode.lat) ?? null;

      const cost = edgeCost(edge, fromEle, toEle, mode, maxSlope);
      if (!Number.isFinite(cost)) continue;

      const tentativeG = curG + cost;
      const neighborG = gScore.get(edge.to) ?? Infinity;

      if (tentativeG < neighborG) {
        cameFrom.set(edge.to, current.nodeId);
        gScore.set(edge.to, tentativeG);

        const h =
          (haversineDistanceM(
            toNode.lng,
            toNode.lat,
            graph.nodes.get(endNode)!.lng,
            graph.nodes.get(endNode)!.lat,
          ) /
            1000 /
            heuristicSpeed) *
          60;

        const f = tentativeG + h;
        fScore.set(edge.to, f);
        openSet.push({ nodeId: edge.to, cost: tentativeG, heuristic: f });
      }
    }
  }

  if (!found) return null;

  // 重建路径
  return reconstructPath(graph, cameFrom, startNode, endNode, options);
}

// ---- Dijkstra（用于等时线） ----

export interface DijkstraResult {
  /** nodeId → 从起点到达的时间 (min) */
  times: Map<number, number>;
  /** nodeId → 前驱节点 */
  cameFrom: Map<number, number>;
}

/** Dijkstra 全图扩展 */
export function dijkstra(
  graph: RouteGraph,
  startLng: number,
  startLat: number,
  mode: TravelMode,
  maxSlopeDeg?: number,
  queryElevation?: (lng: number, lat: number) => number | null,
): DijkstraResult | null {
  const startNode = graph.nearestNode(startLng, startLat);
  if (startNode === null) return null;

  const maxSlope = maxSlopeDeg ?? MODE_MAX_SLOPE[mode];
  const times = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const openSet = new MinHeap();

  times.set(startNode, 0);
  openSet.push({ nodeId: startNode, cost: 0, heuristic: 0 });

  while (openSet.size > 0) {
    const current = openSet.pop()!;
    const curTime = times.get(current.nodeId) ?? Infinity;
    if (current.cost > curTime) continue;

    const edges = graph.edges.get(current.nodeId) ?? [];
    for (const edge of edges) {
      const fromNode = graph.nodes.get(current.nodeId);
      const toNode = graph.nodes.get(edge.to);
      if (!fromNode || !toNode) continue;

      const fromEle = fromNode.ele ?? queryElevation?.(fromNode.lng, fromNode.lat) ?? null;
      const toEle = toNode.ele ?? queryElevation?.(toNode.lng, toNode.lat) ?? null;

      const cost = edgeCost(edge, fromEle, toEle, mode, maxSlope);
      if (!Number.isFinite(cost)) continue;

      const newTime = curTime + cost;
      const oldTime = times.get(edge.to) ?? Infinity;

      if (newTime < oldTime) {
        times.set(edge.to, newTime);
        cameFrom.set(edge.to, current.nodeId);
        openSet.push({ nodeId: edge.to, cost: newTime, heuristic: newTime });
      }
    }
  }

  return { times, cameFrom };
}

// ---- 等时线 ----

export interface IsochroneContour {
  /** 时间阈值 (min) */
  timeMin: number;
  /** 多边形边界 */
  polygon: GeoJSON.Polygon;
}

/**
 * 从 Dijkstra 结果生成等时线
 * 使用简单的 concave-hull 策略：按时间阈值分组节点 → 凸包 → 等时线 ring
 */
export function buildIsochrones(
  graph: RouteGraph,
  dijkstraResult: DijkstraResult,
  thresholdsMin: number[],
): IsochroneContour[] {
  const { times } = dijkstraResult;
  const contours: IsochroneContour[] = [];

  for (const t of thresholdsMin.sort((a, b) => a - b)) {
    const points: [number, number][] = [];
    for (const [nodeId, time] of times) {
      if (time <= t) {
        const node = graph.nodes.get(nodeId);
        if (node) points.push([node.lng, node.lat]);
      }
    }

    if (points.length < 3) continue;

    // 计算凸包
    const hull = convexHull(points);
    if (hull.length >= 3) {
      // 闭合多边形
      const coords = [...hull, hull[0]!];
      contours.push({
        timeMin: t,
        polygon: {
          type: 'Polygon',
          coordinates: [coords],
        },
      });
    }
  }

  return contours;
}

// ---- 凸包 (Andrew's monotone chain) ----

function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function convexHull(points: [number, number][]): [number, number][] {
  if (points.length <= 1) return points;
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// ---- 路径重建 ----

function reconstructPath(
  graph: RouteGraph,
  cameFrom: Map<number, number>,
  startNode: number,
  endNode: number,
  options: RouteOptions,
): RouteResult {
  const { queryElevation } = options;
  const path: GraphNode[] = [];
  let current = endNode;
  while (current !== startNode) {
    const node = graph.nodes.get(current);
    if (!node) break;
    path.unshift(node);
    const prev = cameFrom.get(current);
    if (prev === undefined) break;
    current = prev;
  }
  path.unshift(graph.nodes.get(startNode)!);

  // 提取坐标
  const coordinates: [number, number][] = path.map((n) => [n.lng, n.lat]);
  const waypoints = path.map((n) => ({
    lng: n.lng,
    lat: n.lat,
    ele: n.ele ?? queryElevation?.(n.lng, n.lat) ?? null,
  }));

  // 统计
  let totalDistanceM = 0;
  let totalClimbM = 0;
  let totalDescentM = 0;
  let totalDurationMin = 0;
  const segments: RouteSegment[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i]!;
    const to = path[i + 1]!;
    const dist = haversineDistanceM(from.lng, from.lat, to.lng, to.lat);
    const fromEle = from.ele ?? queryElevation?.(from.lng, from.lat) ?? 0;
    const toEle = to.ele ?? queryElevation?.(to.lng, to.lat) ?? 0;
    const dEle = toEle - fromEle;
    const slopeDeg = Math.atan(Math.abs(dEle) / Math.max(dist, 1)) * (180 / Math.PI);
    const speed = options.mode === 'walking' ? 5 : options.mode === 'cycling' ? 15 : 40;
    const timeM = (dist / 1000 / speed) * 60;

    totalDistanceM += dist;
    if (dEle > 0) totalClimbM += dEle;
    else totalDescentM += Math.abs(dEle);
    totalDurationMin += timeM;

    segments.push({
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
      distanceM: dist,
      durationMin: timeM,
      climbM: dEle > 0 ? dEle : 0,
      descentM: dEle < 0 ? Math.abs(dEle) : 0,
      avgSlopeDeg: slopeDeg,
    });
  }

  // 难度评级
  let difficulty: RouteResult['difficulty'] = 'easy';
  if (totalClimbM > 2000 || totalDistanceM > 50000) difficulty = 'extreme';
  else if (totalClimbM > 1000 || totalDistanceM > 30000) difficulty = 'hard';
  else if (totalClimbM > 400 || totalDistanceM > 15000) difficulty = 'moderate';

  return {
    path: {
      type: 'LineString',
      coordinates,
    },
    waypoints,
    totalDistanceKm: totalDistanceM / 1000,
    totalDurationMin,
    totalClimbM,
    totalDescentM,
    difficulty,
    segments,
  };
}

// ---- 路网构建 ----

/** 从 OSM way features 构建路网图 */
export function buildRoadGraph(
  features: Array<{
    geometry: GeoJSON.LineString;
    properties: Record<string, unknown>;
  }>,
): RouteGraph {
  const nodeMap = new Map<string, number>();
  const nodes = new Map<number, GraphNode>();
  const edges = new Map<number, GraphEdge[]>();
  let nextId = 0;

  function getOrCreateNode(lng: number, lat: number): number {
    const key = `${lng.toFixed(7)},${lat.toFixed(7)}`;
    const existing = nodeMap.get(key);
    if (existing !== undefined) return existing;
    const id = nextId++;
    nodeMap.set(key, id);
    nodes.set(id, { id, lng, lat, ele: null });
    edges.set(id, []);
    return id;
  }

  for (const feature of features) {
    const coords = feature.geometry.coordinates as [number, number][];
    const highway = feature.properties.highway as string | undefined;
    const maxSpeed = feature.properties.maxspeed ? Number(feature.properties.maxspeed) : undefined;
    const speedKmh = maxSpeed ?? speedFromHighway(highway);

    for (let i = 0; i < coords.length - 1; i++) {
      const [lng1, lat1] = coords[i]!;
      const [lng2, lat2] = coords[i + 1]!;
      const fromId = getOrCreateNode(lng1, lat1);
      const toId = getOrCreateNode(lng2, lat2);
      const dist = haversineDistanceM(lng1, lat1, lng2, lat2);

      // 双向边
      const edge: GraphEdge = {
        from: fromId,
        to: toId,
        distanceM: dist,
        highway,
        maxSpeedKmh: speedKmh,
      };
      edges.get(fromId)!.push(edge);
      edges.get(toId)!.push({ ...edge, from: toId, to: fromId });
    }
  }

  // 空间索引（简单暴力搜索，小图可用；大图应用 R-tree）
  const nodeList = Array.from(nodes.values());
  function nearestNode(lng: number, lat: number): number | null {
    if (nodeList.length === 0) return null;
    let best = nodeList[0]!;
    let bestDist = haversineDistanceM(lng, lat, best.lng, best.lat);
    for (const n of nodeList) {
      const d = haversineDistanceM(lng, lat, n.lng, n.lat);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best.id;
  }

  return { nodes, edges, nearestNode };
}

// ---- 直线路径（无路网时的降级方案） ----

/**
 * 当没有路网数据时，生成多点或起终点的直线路径
 * 沿途采样 DEM 获取高程
 */
export function directPath(
  startOrPoints: [number, number] | [number, number][],
  endOrMode: [number, number] | TravelMode,
  modeOrQuery?: TravelMode | ((lng: number, lat: number) => number | null),
  queryElevation?: (lng: number, lat: number) => number | null,
): RouteResult {
  let points: [number, number][];
  let mode: TravelMode;
  let qElev: ((lng: number, lat: number) => number | null) | undefined;

  if (Array.isArray(startOrPoints) && startOrPoints.length > 0 && Array.isArray(startOrPoints[0])) {
    points = startOrPoints as [number, number][];
    mode = endOrMode as TravelMode;
    qElev = typeof modeOrQuery === 'function' ? modeOrQuery : undefined;
  } else {
    points = [startOrPoints as [number, number], endOrMode as [number, number]];
    mode = modeOrQuery as TravelMode;
    qElev = queryElevation;
  }

  const coordinates: [number, number][] = [];
  const waypoints: RouteResult['waypoints'] = [];
  const segments: RouteSegment[] = [];
  let totalDistM = 0;
  const speed = MODE_SPEEDS[mode];

  for (let s = 0; s < points.length - 1; s++) {
    const p1 = points[s]!;
    const p2 = points[s + 1]!;
    const legDist = haversineDistanceM(p1[0], p1[1], p2[0], p2[1]);
    const numPoints = Math.max(2, Math.ceil(legDist / 100));

    const legCoords: [number, number][] = [];
    const legWaypoints: RouteResult['waypoints'] = [];

    const startIdx = s === 0 ? 0 : 1;
    for (let i = startIdx; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      const lng = p1[0] + (p2[0] - p1[0]) * t;
      const lat = p1[1] + (p2[1] - p1[1]) * t;
      const pt: [number, number] = [lng, lat];
      coordinates.push(pt);
      legCoords.push(pt);
      const wp = { lng, lat, ele: qElev?.(lng, lat) ?? null };
      waypoints.push(wp);
      legWaypoints.push(wp);
    }

    let legClimbM = 0;
    let legDescentM = 0;
    for (let i = 0; i < legWaypoints.length - 1; i++) {
      const fEle = legWaypoints[i]?.ele;
      const tEle = legWaypoints[i + 1]?.ele;
      if (fEle !== null && fEle !== undefined && tEle !== null && tEle !== undefined) {
        const d = tEle - fEle;
        if (d > 0) legClimbM += d;
        else legDescentM += Math.abs(d);
      }
    }

    totalDistM += legDist;
    const legDurationMin = (legDist / 1000 / speed) * 60;
    segments.push({
      coordinates: legCoords,
      distanceM: legDist,
      durationMin: legDurationMin,
      climbM: legClimbM,
      descentM: legDescentM,
      avgSlopeDeg: 0,
    });
  }

  let totalClimbM = 0;
  let totalDescentM = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const fromEle = waypoints[i]!.ele;
    const toEle = waypoints[i + 1]!.ele;
    if (fromEle !== null && toEle !== null) {
      const d = toEle - fromEle;
      if (d > 0) totalClimbM += d;
      else totalDescentM += Math.abs(d);
    }
  }

  let difficulty: RouteResult['difficulty'] = 'easy';
  if (totalClimbM > 2000 || totalDistM > 50000) difficulty = 'extreme';
  else if (totalClimbM > 1000 || totalDistM > 30000) difficulty = 'hard';
  else if (totalClimbM > 400 || totalDistM > 15000) difficulty = 'moderate';

  return {
    path: { type: 'LineString', coordinates },
    waypoints,
    totalDistanceKm: totalDistM / 1000,
    totalDurationMin: (totalDistM / 1000 / speed) * 60,
    totalClimbM,
    totalDescentM,
    difficulty,
    segments,
    source: 'direct',
  };
}

// ---- OSRM / OpenStreetMap 实际道路导航与多方案规划 ----

/**
 * 获取多条备选路线方案（包含走大路、近道、少路口、平缓等特征）
 * 优先采用 OSM Germany 专有人行(routed-foot)/骑行(routed-bike)/机动车(routed-car)独立引擎，
 * 严格区分人行山间小路与车辆通行限制，自动放宽野外小径吸附半径并解析路口与转弯特征。
 */
export async function fetchOSRMAlternativeRoutes(
  points: [number, number][],
  mode: TravelMode,
  queryElevation?: (lng: number, lat: number) => number | null,
  signal?: AbortSignal,
): Promise<RouteResult[]> {
  if (points.length < 2) return [];

  const coordsParam = points.map(([lng, lat]) => `${lng},${lat}`).join(';');
  // 步行/骑行模式下放宽吸附半径到 1500m，避免山野徒步/小径错吸到远处公路
  const radiusesParam = points.map(() => (mode === 'driving' ? '800' : '1500')).join(';');

  // OSM Germany 专有引擎子服务：routed-foot (全量人行/步道/石阶/山径), routed-bike (自行车道/绿道), routed-car (机动车道)
  const osmDeSub = mode === 'walking' ? 'foot' : mode === 'cycling' ? 'bike' : 'car';
  const urlPrimary = `https://routing.openstreetmap.de/routed-${osmDeSub}/route/v1/driving/${coordsParam}?overview=full&geometries=geojson&alternatives=3&steps=true&radiuses=${radiusesParam}`;

  // 备用 Project OSRM 公共服务
  const osrmProfile = mode === 'cycling' ? 'bike' : mode === 'walking' ? 'foot' : 'driving';
  const urlFallback = `https://router.project-osrm.org/route/v1/${osrmProfile}/${coordsParam}?overview=full&geometries=geojson&alternatives=3&steps=true`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rawRoutes: any[] = [];

  // 1. 请求首选专有引擎
  try {
    const resp = await fetch(urlPrimary, { signal: controller.signal });
    if (resp.ok) {
      const data = await resp.json();
      if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
        rawRoutes = data.routes;
      }
    }
  } catch {
    // Primary failed, continue to fallback
  }

  // 2. 首选不可达时，请求备用公共服务
  if (rawRoutes.length === 0) {
    try {
      const resp = await fetch(urlFallback, { signal: controller.signal });
      if (resp.ok) {
        const data = await resp.json();
        if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
          rawRoutes = data.routes;
        }
      }
    } catch {
      // Fallback failed
    }
  }

  clearTimeout(timeoutId);

  // 3. 若只有 1 条路线且为起终点（两点导航），主动探测一条合理平行的备选路线
  if (rawRoutes.length === 1 && points.length === 2) {
    try {
      const p1 = points[0]!;
      const p2 = points[1]!;
      const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const perp = [-dy, dx];
      const detourPt: [number, number] = [mid[0] + perp[0] * 0.25, mid[1] + perp[1] * 0.25];
      const detourCoords = `${p1.join(',')};${detourPt.join(',')};${p2.join(',')}`;
      const detourUrl = `https://routing.openstreetmap.de/routed-${osmDeSub}/route/v1/driving/${detourCoords}?overview=full&geometries=geojson&steps=true`;
      const detourResp = await fetch(detourUrl);
      if (detourResp.ok) {
        const dData = await detourResp.json();
        if (dData.code === 'Ok' && dData.routes?.[0]) {
          const dRoute = dData.routes[0];
          // 里程增加在 50% 以内视作有效备选
          if (dRoute.distance < rawRoutes[0].distance * 1.5 && Math.abs(dRoute.distance - rawRoutes[0].distance) > 50) {
            rawRoutes.push(dRoute);
          }
        }
      }
    } catch {
      // 忽略探测失败
    }
  }

  if (rawRoutes.length === 0) return [];

  // 4. 将原始路由转换为 RouteResult 并统计路口与转弯
  const results: RouteResult[] = rawRoutes.map((route) => {
    const coords: [number, number][] = route.geometry.coordinates;
    const waypoints: RouteResult['waypoints'] = coords.map(([lng, lat]) => ({
      lng,
      lat,
      ele: queryElevation?.(lng, lat) ?? null,
    }));

    let totalClimbM = 0;
    let totalDescentM = 0;
    const segments: RouteSegment[] = [];

    for (let i = 0; i < coords.length - 1; i++) {
      const from = coords[i]!;
      const to = coords[i + 1]!;
      const dist = haversineDistanceM(from[0], from[1], to[0], to[1]);
      const fromEle = waypoints[i]!.ele ?? 0;
      const toEle = waypoints[i + 1]!.ele ?? 0;
      const dEle = toEle - fromEle;
      const slopeDeg = Math.atan(Math.abs(dEle) / Math.max(dist, 1)) * (180 / Math.PI);
      const segDurationMin = (dist / 1000 / MODE_SPEEDS[mode]) * 60;

      if (dEle > 0) totalClimbM += dEle;
      else totalDescentM += Math.abs(dEle);

      segments.push({
        coordinates: [from, to],
        distanceM: dist,
        durationMin: segDurationMin,
        climbM: dEle > 0 ? dEle : 0,
        descentM: dEle < 0 ? Math.abs(dEle) : 0,
        avgSlopeDeg: slopeDeg,
      });
    }

    // 统计路口数量与转弯次数
    let intersectionCount = 0;
    let turnCount = 0;
    if (Array.isArray(route.legs)) {
      for (const leg of route.legs) {
        if (Array.isArray(leg.steps)) {
          for (const st of leg.steps) {
            if (Array.isArray(st.intersections)) {
              intersectionCount += st.intersections.length;
            }
            if (st.maneuver?.type === 'turn' || st.maneuver?.modifier?.includes('turn')) {
              turnCount++;
            }
          }
        }
      }
    }

    const totalDistKm = (route.distance ?? 0) / 1000;
    const totalDurationMin = (route.duration ?? 0) / 60;

    let difficulty: RouteResult['difficulty'] = 'easy';
    if (totalClimbM > 2000 || totalDistKm > 50) difficulty = 'extreme';
    else if (totalClimbM > 1000 || totalDistKm > 30) difficulty = 'hard';
    else if (totalClimbM > 400 || totalDistKm > 15) difficulty = 'moderate';

    return {
      path: { type: 'LineString', coordinates: coords },
      waypoints,
      totalDistanceKm: totalDistKm,
      totalDurationMin,
      totalClimbM,
      totalDescentM,
      difficulty,
      segments,
      source: 'osrm',
      intersectionCount: intersectionCount > 0 ? intersectionCount : undefined,
      turnCount: turnCount > 0 ? turnCount : undefined,
    };
  });

  // 5. 智能打标与对比
  if (results.length === 1) {
    results[0]!.label = '🏆 推荐路线';
    results[0]!.labelDesc = mode === 'walking' ? '沿行人步道/小径直达' : mode === 'cycling' ? '骑行适行路线' : '主干道通行时间最优';
    return results;
  }

  // 寻找基准指标
  let minDurationIdx = 0;
  let minDistanceIdx = 0;
  let minIntersectionsIdx = 0;
  let minClimbIdx = 0;

  for (let i = 1; i < results.length; i++) {
    if (results[i]!.totalDurationMin < results[minDurationIdx]!.totalDurationMin) minDurationIdx = i;
    if (results[i]!.totalDistanceKm < results[minDistanceIdx]!.totalDistanceKm) minDistanceIdx = i;
    if ((results[i]!.intersectionCount ?? 999) < (results[minIntersectionsIdx]!.intersectionCount ?? 999)) {
      minIntersectionsIdx = i;
    }
    if (results[i]!.totalClimbM < results[minClimbIdx]!.totalClimbM) minClimbIdx = i;
  }

  // 最短耗时路线为推荐
  results[minDurationIdx]!.label = '🏆 推荐·走大路';
  results[minDurationIdx]!.labelDesc = '主路路况通畅，通行耗时最短';

  results.forEach((r, idx) => {
    if (idx === minDurationIdx) return;

    const durDiff = r.totalDurationMin - results[minDurationIdx]!.totalDurationMin;
    const distDiff = results[minDurationIdx]!.totalDistanceKm - r.totalDistanceKm;
    const intDiff = (results[minDurationIdx]!.intersectionCount ?? 0) - (r.intersectionCount ?? 0);
    const climbDiff = results[minDurationIdx]!.totalClimbM - r.totalClimbM;

    if (idx === minDistanceIdx && distDiff > 0.05) {
      r.label = '⚡ 近道·距离更短';
      r.labelDesc = `少 ${distDiff.toFixed(1)} km${durDiff > 0.5 ? `，多耗时 ${durDiff.toFixed(0)} min` : ''}`;
    } else if (idx === minIntersectionsIdx && intDiff >= 3) {
      r.label = '🚦 少路口·少红绿灯';
      r.labelDesc = `少 ${intDiff} 个路口/红绿灯，转向更少`;
    } else if (idx === minClimbIdx && climbDiff >= 30) {
      r.label = '🍃 平缓·爬升更少';
      r.labelDesc = `累计爬升少 ${climbDiff.toFixed(0)}m，更平缓省力`;
    } else {
      r.label = `备选路线 ${idx + 1}`;
      r.labelDesc = distDiff > 0 ? `省 ${distDiff.toFixed(1)} km` : `备选通行路线`;
    }
  });

  return results;
}

/**
 * 道路导航（单路线向后兼容接口）
 */
export async function fetchOSRMRoute(
  startOrPoints: [number, number] | [number, number][],
  endOrMode: [number, number] | TravelMode,
  modeOrQuery?: TravelMode | ((lng: number, lat: number) => number | null),
  queryElevationOrSignal?: ((lng: number, lat: number) => number | null) | AbortSignal,
  signal?: AbortSignal,
): Promise<RouteResult | null> {
  let points: [number, number][];
  let mode: TravelMode;
  let queryElevation: ((lng: number, lat: number) => number | null) | undefined;
  let abortSignal: AbortSignal | undefined;

  if (Array.isArray(startOrPoints) && startOrPoints.length > 0 && Array.isArray(startOrPoints[0])) {
    points = startOrPoints as [number, number][];
    mode = endOrMode as TravelMode;
    queryElevation = typeof modeOrQuery === 'function' ? modeOrQuery : undefined;
    abortSignal = queryElevationOrSignal instanceof AbortSignal ? queryElevationOrSignal : undefined;
  } else {
    points = [startOrPoints as [number, number], endOrMode as [number, number]];
    mode = modeOrQuery as TravelMode;
    queryElevation = typeof queryElevationOrSignal === 'function' ? queryElevationOrSignal : undefined;
    abortSignal = signal;
  }

  const routes = await fetchOSRMAlternativeRoutes(points, mode, queryElevation, abortSignal);
  return routes[0] ?? null;
}
