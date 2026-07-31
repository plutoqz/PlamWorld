// workers/worker-bridge.ts — 主线程 ↔ Web Worker Promise 化通信桥
//
// 设计要点：
// - 每个请求带唯一 id，Worker 返回同 id 的响应
// - 主线程用 Promise + resolve/reject map 管理异步回调
// - 支持超时（默认 30s）
// - 类型安全的消息协议

// ---- 消息协议 ----

/** 主线程 → Worker 请求消息 */
export type WorkerMessage =
  | { id: string; type: 'CALCULATE_DISTANCE'; payload: GeoJSON.LineString }
  | { id: string; type: 'CALCULATE_AREA'; payload: GeoJSON.Polygon }
  | { id: string; type: 'PARSE_GEOJSON'; payload: string }
  | {
      id: string;
      type: 'SAMPLE_ELEVATIONS';
      payload: { path: [number, number][]; elevations: number[]; interval: number };
    }
  | {
      id: string;
      type: 'HYDROLOGY';
      payload: HydrologyInput;
    }
  | {
      id: string;
      type: 'HYDROLOGY_WATERSHED';
      payload: HydrologyInput & { pourCol: number; pourRow: number };
    }
  | {
      id: string;
      type: 'HYDROLOGY_TWI';
      payload: HydrologyInput;
    };

/* Hydrological analysis input delivered as flat arrays (can be serialized). */
export interface HydrologyInput {
  dem: number[];
  cols: number;
  rows: number;
  cellSize: number;
}

/** Worker → 主线程 响应消息 */
export type WorkerResponse =
  | { id: string; type: 'RESULT'; payload: number }
  | { id: string; type: 'ELEVATION_PROFILE'; payload: { distance: number; elevation: number }[] }
  | { id: string; type: 'CLIMB_STATS'; payload: { totalClimb: number; totalDescent: number; netChange: number; maxSlope: number; avgSlope: number; difficulty: string } }
  | { id: string; type: 'GEOJSON'; payload: GeoJSON.FeatureCollection }
  | { id: string; type: 'HYDROLOGY_RESULT'; payload: HydrologyResult }
  | { id: string; type: 'HYDROLOGY_WATERSHED_RESULT'; payload: HydrologyResult & { watershed: number[] } }
  | { id: string; type: 'HYDROLOGY_TWI_RESULT'; payload: HydrologyResult & { twi: number[] } }
  | { id: string; type: 'ERROR'; payload: string };

/** Hydrological analysis output delivered as flat arrays. */
export interface HydrologyResult {
  flowDir: number[];
  flowAcc: number[];
  sinkCount: number;
  maxFlowAcc: number;
}

// ---- Worker Bridge ----

type PendingRequest = {
  resolve: (value: WorkerResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class WorkerBridge {
  private worker: Worker;
  private pending = new Map<string, PendingRequest>();
  private defaultTimeout: number;

  constructor(worker: Worker, defaultTimeout = 30_000) {
    this.worker = worker;
    this.defaultTimeout = defaultTimeout;
    this.worker.onmessage = this._onMessage.bind(this);
    this.worker.onerror = (e) => {
      console.error('[WorkerBridge] Worker error:', e);
    };
  }

  /** 发送消息到 Worker，返回 Promise<WorkerResponse> */
  call(msg: Omit<WorkerMessage, 'id'>, timeout?: number): Promise<WorkerResponse> {
    const id = generateId();
    const fullMsg: WorkerMessage = { ...msg, id } as WorkerMessage;

    return new Promise<WorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`[WorkerBridge] 请求超时: ${msg.type} (${id})`));
      }, timeout ?? this.defaultTimeout);

      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage(fullMsg);
    });
  }

  /** 便捷方法：计算线距离 (km) */
  async calcDistance(line: GeoJSON.LineString): Promise<number> {
    const resp = await this.call({ type: 'CALCULATE_DISTANCE', payload: line });
    if (resp.type === 'RESULT') return resp.payload;
    throw new Error(resp.type === 'ERROR' ? resp.payload : '未知响应');
  }

  /** 便捷方法：计算面面积 (m²) */
  async calcArea(polygon: GeoJSON.Polygon): Promise<number> {
    const resp = await this.call({ type: 'CALCULATE_AREA', payload: polygon });
    if (resp.type === 'RESULT') return resp.payload;
    throw new Error(resp.type === 'ERROR' ? resp.payload : '未知响应');
  }

  /** 销毁 Worker */
  terminate(): void {
    this.pending.forEach(({ timer, reject }) => {
      clearTimeout(timer);
      reject(new Error('[WorkerBridge] Worker 已终止'));
    });
    this.pending.clear();
    this.worker.terminate();
  }

  /** v0.5 水文分析：计算 D8 流向 + 流量累积 */
  async hydrology(input: HydrologyInput): Promise<HydrologyResult> {
    const resp = await this.call({ type: 'HYDROLOGY', payload: input }, 60_000);
    if (resp.type === 'HYDROLOGY_RESULT') return resp.payload;
    throw new Error(resp.type === 'ERROR' ? resp.payload : '未知水文分析响应');
  }

  /** v0.5 水文分析：流域划分（需提供倾泻点行列坐标） */
  async hydrologyWatershed(input: HydrologyInput & { pourCol: number; pourRow: number }) {
    const resp = await this.call({ type: 'HYDROLOGY_WATERSHED', payload: input }, 60_000);
    if (resp.type === 'HYDROLOGY_WATERSHED_RESULT') return resp.payload;
    throw new Error(resp.type === 'ERROR' ? resp.payload : '未知流域划分响应');
  }

  /** v0.5 水文分析：TWI 地形湿度指数 */
  async hydrologyTWI(input: HydrologyInput) {
    const resp = await this.call({ type: 'HYDROLOGY_TWI', payload: input }, 60_000);
    if (resp.type === 'HYDROLOGY_TWI_RESULT') return resp.payload;
    throw new Error(resp.type === 'ERROR' ? resp.payload : '未知 TWI 响应');
  }

  /** 处理 Worker 回信 */
  private _onMessage(e: MessageEvent<WorkerResponse>): void {
    const resp = e.data;
    const pending = this.pending.get(resp.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(resp.id);

    if (resp.type === 'ERROR') {
      pending.reject(new Error(resp.payload));
    } else {
      pending.resolve(resp);
    }
  }
}

/** 生成唯一 ID (降级方案：crypto.randomUUID 不支持时) */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
