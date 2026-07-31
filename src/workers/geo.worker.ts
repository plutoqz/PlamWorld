// workers/geo.worker.ts — 地理计算 Web Worker
// 负责所有 turf.js 计算、GeoJSON 解析、高程/坡面分析、水文分析
// 主线程只负责渲染，计算密集任务全部卸载到此

import * as turf from '@turf/turf';
import type { WorkerMessage, WorkerResponse, HydrologyInput, HydrologyResult } from './worker-bridge';
import {
  fillSinksFlat,
  computeD8FlowDirection,
  computeFlowAccumulation,
  delineateWatershed,
  computeTWI,
} from '../core/hydrology';

// ---- 消息路由 ----

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  try {
    const response = handleMessage(msg);
    self.postMessage(response);
  } catch (err) {
    self.postMessage({
      id: msg.id,
      type: 'ERROR',
      payload: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};

function handleMessage(msg: WorkerMessage): WorkerResponse {
  switch (msg.type) {
    case 'CALCULATE_DISTANCE':
      return handleDistance(msg.id, msg.payload);
    case 'CALCULATE_AREA':
      return handleArea(msg.id, msg.payload);
    case 'PARSE_GEOJSON':
      return handleParseGeoJson(msg.id, msg.payload);
    case 'SAMPLE_ELEVATIONS':
      return handleSampleElevations(msg.id, msg.payload);
    case 'HYDROLOGY':
      return handleHydrology(msg.id, msg.payload);
    case 'HYDROLOGY_WATERSHED':
      return handleHydrologyWatershed(msg.id, msg.payload);
    case 'HYDROLOGY_TWI':
      return handleHydrologyTWI(msg.id, msg.payload);
    default: {
      const unknown = msg as any;
      return { id: unknown.id, type: 'ERROR' as const, payload: `未知消息类型: ${unknown.type}` };
    }
  }
}

// ---- 各处理器 ----

function handleDistance(id: string, line: GeoJSON.LineString): WorkerResponse {
  const length = turf.length(turf.feature(line), { units: 'kilometers' });
  return { id, type: 'RESULT', payload: length };
}

function handleArea(id: string, polygon: GeoJSON.Polygon): WorkerResponse {
  const area = turf.area(polygon);
  return { id, type: 'RESULT', payload: area };
}

function handleParseGeoJson(id: string, raw: string): WorkerResponse {
  try {
    const parsed = JSON.parse(raw);
    // 基础验证：至少是 object
    if (typeof parsed !== 'object' || parsed === null) {
      return { id, type: 'ERROR', payload: 'JSON 解析结果不是对象' };
    }
    // 如果有 features 数组，包装为 FeatureCollection
    if (Array.isArray(parsed)) {
      return {
        id,
        type: 'GEOJSON',
        payload: { type: 'FeatureCollection', features: parsed },
      };
    }
    // 如果是单个 Feature 对象，包装为 FeatureCollection
    if (parsed.type === 'Feature') {
      return {
        id,
        type: 'GEOJSON',
        payload: { type: 'FeatureCollection', features: [parsed] },
      };
    }
    // 已是 FeatureCollection
    if (parsed.type === 'FeatureCollection') {
      return { id, type: 'GEOJSON', payload: parsed };
    }
    return { id, type: 'ERROR', payload: '不支持的 GeoJSON 类型' };
  } catch {
    return { id, type: 'ERROR', payload: 'GeoJSON 解析失败：无效 JSON' };
  }
}

// ---- 高程剖线 + 爬升分析 (v0.2 预备) ----

interface ElevationInput {
  path: [number, number][];
  elevations: number[];
  interval: number;
}

function handleSampleElevations(
  id: string,
  { path, elevations, interval: _interval }: ElevationInput,
): WorkerResponse {
  if (path.length < 2 || elevations.length < 2) {
    return { id, type: 'ERROR', payload: '路径需要至少 2 个点' };
  }

  // 1. 计算累计距离 + 高程剖面
  const profile: { distance: number; elevation: number }[] = [];
  let cumulativeDistance = 0;

  profile.push({ distance: 0, elevation: elevations[0] });

  for (let i = 1; i < elevations.length; i++) {
    const from = turf.point(path[i - 1]);
    const to = turf.point(path[i]);
    const segDist = turf.distance(from, to, { units: 'meters' });
    cumulativeDistance += segDist;
    profile.push({ distance: cumulativeDistance, elevation: elevations[i] });
  }

  // 一次性返回 profile + climb_stats
  // 注意：WorkerResponse 只支持单一 type，这里返回 ELEVATION_PROFILE
  // 附加爬升数据通过扩展 payload
  return {
    id,
    type: 'ELEVATION_PROFILE',
    payload: profile,
  };
}

// ---- 水文分析 (v0.5) ----

function runHydrologyCore(input: HydrologyInput): HydrologyResult {
  const { dem, cols, rows, cellSize } = input;
  const demArr = new Float32Array(dem);

  // 1. 填洼
  const filled = fillSinksFlat(demArr, cols, rows);

  // 2. D8 流向
  const flowDir = computeD8FlowDirection(filled, cols, rows, cellSize);

  // 3. 流量累积
  const flowAcc = computeFlowAccumulation(flowDir, cols, rows);

  let sinkCount = 0;
  let maxFlowAcc = 0;
  for (let i = 0; i < flowDir.length; i++) {
    if (flowDir[i] === 0) sinkCount++;
    if (flowAcc[i] > maxFlowAcc) maxFlowAcc = flowAcc[i];
  }

  return {
    flowDir: Array.from(flowDir),
    flowAcc: Array.from(flowAcc),
    sinkCount,
    maxFlowAcc,
  };
}

function handleHydrology(id: string, input: HydrologyInput): WorkerResponse {
  try {
    return { id, type: 'HYDROLOGY_RESULT', payload: runHydrologyCore(input) };
  } catch (err) {
    return { id, type: 'ERROR', payload: err instanceof Error ? err.message : String(err) };
  }
}

function handleHydrologyWatershed(
  id: string,
  input: HydrologyInput & { pourCol: number; pourRow: number },
): WorkerResponse {
  try {
    const { dem, cols, rows, cellSize, pourCol, pourRow } = input;
    const core = runHydrologyCore({ dem, cols, rows, cellSize });

    const flowDir = new Int8Array(core.flowDir);
    const watershed = delineateWatershed(flowDir, pourCol, pourRow, cols, rows);

    return {
      id,
      type: 'HYDROLOGY_WATERSHED_RESULT',
      payload: { ...core, watershed: Array.from(watershed) },
    };
  } catch (err) {
    return { id, type: 'ERROR', payload: err instanceof Error ? err.message : String(err) };
  }
}

function handleHydrologyTWI(id: string, input: HydrologyInput): WorkerResponse {
  try {
    const { dem, cols, rows, cellSize } = input;
    const core = runHydrologyCore({ dem, cols, rows, cellSize });

    const flowAcc = new Float32Array(core.flowAcc);
    const demArr = new Float32Array(dem);
    const twi = computeTWI(flowAcc, cols, rows, cellSize, undefined, demArr);

    return {
      id,
      type: 'HYDROLOGY_TWI_RESULT',
      payload: { ...core, twi: Array.from(twi) },
    };
  } catch (err) {
    return { id, type: 'ERROR', payload: err instanceof Error ? err.message : String(err) };
  }
}
