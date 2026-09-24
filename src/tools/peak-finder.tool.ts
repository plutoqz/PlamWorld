// tools/peak-finder.tool.ts — 峰顶识别器工具 (MapTool)
//
// 用户点击视点 → 从内置山峰数据库筛选可见山峰 → 地图标签
// 复用 v0.3 通视算法简化版（horizon line 单方位角）

import type { MapTool, ToolContext } from '../core/tools';
import type { LngLat } from '../core/types';
import { queryElevations } from '../engines/elevation-api';

export interface PeakInfo {
  name: string;
  lat: number;
  lng: number;
  elevation: number; // m
  distance: number;   // km
  bearing: number;    // deg from view point (0-360)
  pitchAngle?: number; // deg 仰角 (-90 to +90, 考虑地球曲率)
  visible: boolean;
  source?: 'catalog' | 'dem' | 'osm';
}

export class PeakFinderTool implements MapTool {
  readonly id = 'peak-finder';
  readonly name = '峰顶识别器';
  readonly icon = '⛰️';
  readonly category = 'measurement';
  readonly description = '点击视点 → 标注可见山峰';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private _viewPoint: LngLat | null = null;
  private _observerHeight = 2;   // m
  private _observerElevation = 0; // 地表海拔 (m)
  private _searchRadius = 100;    // km
  private _peaks: PeakInfo[] = [];
  private _searching = false;
  private searchController: AbortController | null = null;
  private onStateChange: (() => void) | null = null;

  // 内置精选全球与中国著名山峰数据库 (~65 peaks)
  private static SAMPLE_PEAKS: Omit<PeakInfo, 'distance' | 'bearing' | 'visible'>[] = [
    // 喜马拉雅 & 喀喇昆仑 8000m+ 巨峰
    { name: '珠穆朗玛峰', lat: 27.9881, lng: 86.9250, elevation: 8848 },
    { name: 'K2 (乔戈里峰)', lat: 35.8825, lng: 76.5133, elevation: 8611 },
    { name: '干城章嘉峰', lat: 27.7025, lng: 88.1475, elevation: 8586 },
    { name: '洛子峰', lat: 27.9617, lng: 86.9331, elevation: 8516 },
    { name: '马卡鲁峰', lat: 27.8897, lng: 87.0889, elevation: 8485 },
    { name: '卓奥友峰', lat: 28.0942, lng: 86.6608, elevation: 8201 },
    { name: '道拉吉里峰', lat: 28.6983, lng: 83.4875, elevation: 8167 },
    { name: '马纳斯卢峰', lat: 28.5497, lng: 84.5597, elevation: 8163 },
    { name: '南迦帕尔巴特峰', lat: 35.2375, lng: 74.5892, elevation: 8126 },
    { name: '安纳普尔纳峰', lat: 28.5961, lng: 83.8203, elevation: 8091 },
    { name: '加舒尔布鲁木I峰', lat: 35.7244, lng: 76.6961, elevation: 8080 },
    { name: '布洛阿特峰', lat: 35.8117, lng: 76.5650, elevation: 8051 },
    { name: '加舒尔布鲁木II峰', lat: 35.7583, lng: 76.6533, elevation: 8034 },
    { name: '希夏邦马峰', lat: 28.3522, lng: 85.7797, elevation: 8027 },

    // 西南 & 横断山脉 & 青藏高原
    { name: '南迦巴瓦峰', lat: 29.6294, lng: 95.0558, elevation: 7782 },
    { name: '贡嘎山', lat: 29.5958, lng: 101.8792, elevation: 7556 },
    { name: '梅里雪山 (卡瓦格博)', lat: 28.4358, lng: 98.6833, elevation: 6740 },
    { name: '冈仁波齐', lat: 31.0667, lng: 81.3125, elevation: 6656 },
    { name: '四姑娘山 (幺妹峰)', lat: 31.1075, lng: 102.9031, elevation: 6250 },
    { name: '雀儿山', lat: 31.7833, lng: 99.1167, elevation: 6168 },
    { name: '仙乃日 (稻城亚丁)', lat: 28.4011, lng: 100.3475, elevation: 6032 },
    { name: '央迈勇 (稻城亚丁)', lat: 28.3683, lng: 100.3542, elevation: 5958 },
    { name: '夏诺多吉 (稻城亚丁)', lat: 28.3975, lng: 100.4147, elevation: 5958 },
    { name: '玉龙雪山 (扇子陡)', lat: 27.0989, lng: 100.1772, elevation: 5596 },
    { name: '哈巴雪山', lat: 27.3236, lng: 100.1086, elevation: 5396 },

    // 西北天山 & 帕米尔 & 昆仑 & 祁连 & 贺兰
    { name: '公格尔峰', lat: 38.5933, lng: 75.3153, elevation: 7649 },
    { name: '慕士塔格峰', lat: 38.2758, lng: 75.1131, elevation: 7546 },
    { name: '托木尔峰 (天山)', lat: 42.0369, lng: 80.1294, elevation: 7439 },
    { name: '昆仑山玉珠峰', lat: 35.6517, lng: 94.2517, elevation: 6178 },
    { name: '博格达峰 (天山)', lat: 43.7992, lng: 88.3325, elevation: 5445 },
    { name: '祁连山冷龙岭', lat: 37.6667, lng: 101.9167, elevation: 4872 },
    { name: '贺兰山主峰', lat: 38.8958, lng: 105.9083, elevation: 3556 },

    // 中国五岳 & 著名人文风景名山
    { name: '泰山 (玉皇顶)', lat: 36.2564, lng: 117.1058, elevation: 1545 },
    { name: '华山 (南峰)', lat: 34.4814, lng: 110.0889, elevation: 2154 },
    { name: '衡山 (祝融峰)', lat: 27.2550, lng: 112.7217, elevation: 1300 },
    { name: '恒山 (天峰岭)', lat: 39.6728, lng: 113.7367, elevation: 2017 },
    { name: '嵩山 (连天峰)', lat: 34.4847, lng: 112.9547, elevation: 1512 },
    { name: '黄山 (莲花峰)', lat: 30.1250, lng: 118.1667, elevation: 1864 },
    { name: '峨眉山 (金顶)', lat: 29.5250, lng: 103.3325, elevation: 3079 },
    { name: '庐山 (汉阳峰)', lat: 29.5447, lng: 115.9861, elevation: 1474 },
    { name: '武夷山 (黄岗山)', lat: 27.8869, lng: 117.7831, elevation: 2160 },
    { name: '五台山 (叶斗峰)', lat: 39.0167, lng: 113.5833, elevation: 3061 },
    { name: '九华山 (十王峰)', lat: 30.4833, lng: 117.8000, elevation: 1342 },
    { name: '普陀山 (佛顶山)', lat: 29.9833, lng: 122.3833, elevation: 286 },
    { name: '梵净山 (凤凰山)', lat: 27.9167, lng: 108.6833, elevation: 2572 },
    { name: '长白山 (白云峰)', lat: 42.0078, lng: 128.0558, elevation: 2691 },
    { name: '雁荡山 (百岗尖)', lat: 28.3667, lng: 121.0500, elevation: 1108 },
    { name: '台湾玉山', lat: 23.4700, lng: 120.9573, elevation: 3952 },
    { name: '台湾雪山', lat: 24.3833, lng: 121.2333, elevation: 3886 },
    { name: '海南五指山', lat: 18.8953, lng: 109.6978, elevation: 1867 },

    // 世界七大洲与国际名峰
    { name: '勃朗峰 (阿尔卑斯)', lat: 45.8325, lng: 6.8644, elevation: 4808 },
    { name: '少女峰 (阿尔卑斯)', lat: 46.5369, lng: 7.9625, elevation: 4158 },
    { name: '马特洪峰 (阿尔卑斯)', lat: 45.9764, lng: 7.6583, elevation: 4478 },
    { name: '富士山', lat: 35.3606, lng: 138.7274, elevation: 3776 },
    { name: '阿空加瓜山 (南美)', lat: -32.6531, lng: -70.0117, elevation: 6961 },
    { name: '菲茨罗伊峰 (巴塔哥尼亚)', lat: -49.2714, lng: -73.0431, elevation: 3405 },
    { name: '托雷峰 (巴塔哥尼亚)', lat: -49.2933, lng: -73.0983, elevation: 3128 },
    { name: '乞力马扎罗山 (非洲)', lat: -3.0674, lng: 37.3556, elevation: 5895 },
    { name: '肯尼亚山', lat: -0.1522, lng: 37.3083, elevation: 5199 },
    { name: '麦金利山 (迪纳利, 北美)', lat: 63.0692, lng: -151.0070, elevation: 6190 },
    { name: '雷尼尔山 (北美)', lat: 46.8529, lng: -121.7604, elevation: 4392 },
    { name: '厄尔布鲁士山 (欧洲)', lat: 43.3550, lng: 42.4392, elevation: 5642 },
    { name: '库克山 (新西兰)', lat: -43.5950, lng: 170.1417, elevation: 3724 },
    { name: '查亚峰 (大洋洲)', lat: -4.0789, lng: 137.1583, elevation: 4884 },
    { name: '文森峰 (南极)', lat: -78.5252, lng: -85.6171, elevation: 4892 },
  ];

  // ---- callbacks ----

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  notify(): void {
    this.onStateChange?.();
  }

  // ---- getters ----

  get viewPoint(): LngLat | null { return this._viewPoint ? [...this._viewPoint] as LngLat : null; }
  get observerHeight(): number { return this._observerHeight; }
  get observerElevation(): number { return this._observerElevation; }
  get searchRadius(): number { return this._searchRadius; }
  get peaks(): PeakInfo[] { return this._peaks; }
  get searching(): boolean { return this._searching; }
  get engine() { return this.ctx?.engine ?? null; }

  // ---- setters ----

  setViewPoint(pt: LngLat | null): void {
    this.searchController?.abort();
    this._viewPoint = pt ? [...pt] as LngLat : null;
    if (pt) this.recompute();
    this.notify();
  }

  setObserverHeight(h: number): void {
    this._observerHeight = h;
    if (this._viewPoint) this.recompute();
    this.notify();
  }

  setSearchRadius(km: number): void {
    this._searchRadius = km;
    if (this._viewPoint) this.recompute();
    this.notify();
  }

  // ---- core: compute visible peaks ----

  private recompute(): void {
    if (!this._viewPoint) {
      this._peaks = [];
      this.notify();
      return;
    }
    void this.searchPeaks(this._viewPoint);
  }

  private async searchPeaks(viewPoint: LngLat): Promise<void> {
    this.searchController?.abort();
    const controller = new AbortController();
    this.searchController = controller;
    this._searching = true;
    this.notify();

    const [vpLng, vpLat] = viewPoint;
    const radiusM = Math.min(100, Math.max(5, this._searchRadius)) * 1000;

    try {
      // 1. 获取观察点地表高程 (用于精确计算视线地平线距离)
      let observerGroundEle = 0;
      try {
        const obsEles = await queryElevations([viewPoint], {
          signal: controller.signal,
          resolutionMeters: 90,
        });
        if (obsEles && obsEles[0] !== null && Number.isFinite(obsEles[0])) {
          observerGroundEle = Math.max(0, obsEles[0]);
        }
      } catch {
        // 容错：使用 0m
      }
      if (controller.signal.aborted) return;

      this._observerElevation = Math.round(observerGroundEle);
      const totalObsHeight = observerGroundEle + Math.max(1, this._observerHeight);

      // 2. 尝试从 Overpass API 获取真实自然山峰
      let osmPeaks: PeakInfo[] = [];
      const overpassEndpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
      ];

      const query = `[out:json][timeout:10];node(around:${radiusM},${vpLat},${vpLng})["natural"="peak"];out body 50;`;

      for (const endpoint of overpassEndpoints) {
        if (controller.signal.aborted) return;
        try {
          const resp = await fetch(endpoint, {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query),
            headers: {
              'User-Agent': 'PalmWorld-WebMap/0.6 (https://github.com/plutoqz/PalmWorld)',
            },
            signal: AbortSignal.timeout(9000),
          });

          if (!resp.ok) continue;
          const data = await resp.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const elements: any[] = data.elements ?? [];
          if (elements.length === 0) continue;

          // 提取包含名称或高程的节点
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const namedElements = elements.filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (e: any) =>
              e.tags && (e.tags.name || e.tags['name:zh'] || e.tags['name:en'] || e.tags.ele),
          );
          if (namedElements.length === 0) continue;

          // 需要通过 DEM 补齐高程的节点
          const needEleCoords: { idx: number; coord: LngLat }[] = [];
          const rawPeakList: {
            name: string;
            lat: number;
            lng: number;
            ele: number | null;
          }[] = [];

          namedElements.slice(0, 35).forEach((e, idx) => {
            const name =
              e.tags.name ||
              e.tags['name:zh'] ||
              e.tags['name:en'] ||
              (e.tags.ele ? `${e.tags.ele}m 山峰` : '未命名峰');
            const ele = e.tags.ele ? parseFloat(e.tags.ele) : null;
            rawPeakList.push({
              name,
              lat: e.lat,
              lng: e.lon,
              ele: Number.isFinite(ele) ? ele : null,
            });
            if (ele === null || !Number.isFinite(ele)) {
              needEleCoords.push({ idx, coord: [e.lon, e.lat] });
            }
          });

          // 批量查询缺失的高程
          if (needEleCoords.length > 0) {
            try {
              const queriedEles = await queryElevations(
                needEleCoords.map((c) => c.coord),
                { signal: controller.signal, resolutionMeters: 90 },
              );
              needEleCoords.forEach((item, qIdx) => {
                const eleVal = queriedEles[qIdx];
                if (eleVal !== null && Number.isFinite(eleVal)) {
                  rawPeakList[item.idx]!.ele = Math.round(eleVal);
                } else {
                  rawPeakList[item.idx]!.ele = 300;
                }
              });
            } catch {
              needEleCoords.forEach((item) => {
                rawPeakList[item.idx]!.ele = 300;
              });
            }
          }

          if (controller.signal.aborted) return;

          // 计算距离、方位角，并通过沿途真实地形剖面做 Line-of-Sight (LOS) 视线遮挡通视分析
          const rawCandidates = rawPeakList.map((p) => ({
            name: p.name,
            lat: p.lat,
            lng: p.lng,
            elevation: p.ele ?? 300,
            distance: haversine(vpLat, vpLng, p.lat, p.lng),
            bearing: computeBearing(vpLat, vpLng, p.lat, p.lng),
            source: 'osm' as const,
          }));

          osmPeaks = await this.evaluatePeaksVisibility(
            viewPoint,
            totalObsHeight,
            rawCandidates,
            controller.signal,
          );

          if (osmPeaks.length > 0) break;
        } catch {
          // 尝试下一个端点
        }
      }

      if (controller.signal.aborted) return;

      if (osmPeaks.length > 0) {
        // 排序：真实可见山峰优先，其次按距离由近及远
        osmPeaks.sort((a, b) => {
          if (a.visible !== b.visible) return a.visible ? -1 : 1;
          return a.distance - b.distance;
        });
        this._peaks = osmPeaks.slice(0, 25);
        return;
      }

      // 3. Overpass 无结果或离线：回退到内置名山库
      const catalogCandidates = PeakFinderTool.SAMPLE_PEAKS.flatMap((p) => {
        const distKm = haversine(vpLat, vpLng, p.lat, p.lng);
        if (distKm > this._searchRadius) return [];

        const bearing = computeBearing(vpLat, vpLng, p.lat, p.lng);
        return [{
          ...p,
          distance: distKm,
          bearing,
          source: 'catalog' as const,
        }];
      });

      if (catalogCandidates.length > 0) {
        const catalogResults = await this.evaluatePeaksVisibility(
          viewPoint,
          totalObsHeight,
          catalogCandidates,
          controller.signal,
        );
        catalogResults.sort((a, b) => {
          if (a.visible !== b.visible) return a.visible ? -1 : 1;
          return a.distance - b.distance;
        });
        this._peaks = catalogResults.slice(0, 20);
        return;
      }

      // 4. 内置名山库仍无匹配：回退到 DEM 网格搜索区域最高峰
      await this.findHighestPoint(viewPoint, controller);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.warn('[PeakFinder] 搜索异常:', err);
      }
    } finally {
      if (this.searchController === controller) {
        this.searchController = null;
        this._searching = false;
        this.notify();
      }
    }
  }

  /**
   * 基于沿途真实地形剖面 (LOS) 的视线遮挡通视判定
   * 综合考虑地球曲率与沿途地形山脊遮挡，而非单纯几何地平线距离
   */
  private async evaluatePeaksVisibility(
    viewPoint: LngLat,
    totalObsHeight: number,
    candidatePeaks: {
      name: string;
      lat: number;
      lng: number;
      elevation: number;
      distance: number;
      bearing: number;
      source?: 'catalog' | 'osm' | 'dem';
    }[],
    signal: AbortSignal,
  ): Promise<PeakInfo[]> {
    const R = 6_371_000;
    const SAMPLES_PER_PEAK = 5;
    const sampleFractions = [0.15, 0.3, 0.5, 0.7, 0.85];

    // 1. 初步几何地球曲率视距与有效仰角快速初筛
    const initialList = candidatePeaks.map((p) => {
      const distM = p.distance * 1000;
      const curvatureDropM = (distM * distM) / (2 * R);
      const effectivePeakElev = p.elevation - curvatureDropM;
      const deltaH = effectivePeakElev - totalObsHeight;
      const pitchAngle = Number(((Math.atan2(deltaH, distM) * 180) / Math.PI).toFixed(2));

      const maxSightKm =
        3.86 * (Math.sqrt(totalObsHeight) + Math.sqrt(Math.max(0, p.elevation)));
      const geometricallyPossible = p.distance <= maxSightKm;
      return {
        ...p,
        pitchAngle,
        geometricallyPossible,
        visible: geometricallyPossible,
      };
    });

    // 筛选出几何上在地平线以上、且有一定距离需要做地形遮挡分析的山峰
    const needLosCheck = initialList.filter(
      (p) => p.geometricallyPossible && p.distance >= 1.5,
    );
    if (needLosCheck.length === 0) {
      return initialList.map(({ geometricallyPossible: _, ...rest }) => rest);
    }

    // 2. 收集所有中间剖面采样点（单次批量向 DEM 请求）
    const allSamplePoints: LngLat[] = [];
    const peakSampleRanges: { peakIdx: number; startIdx: number; count: number }[] = [];

    for (let i = 0; i < needLosCheck.length; i++) {
      const p = needLosCheck[i]!;
      const startIdx = allSamplePoints.length;
      for (const f of sampleFractions) {
        allSamplePoints.push([
          viewPoint[0] + (p.lng - viewPoint[0]) * f,
          viewPoint[1] + (p.lat - viewPoint[1]) * f,
        ]);
      }
      peakSampleRanges.push({ peakIdx: i, startIdx, count: SAMPLES_PER_PEAK });
    }

    let sampleElevations: (number | null)[] = [];
    try {
      sampleElevations = await queryElevations(allSamplePoints, {
        signal,
        resolutionMeters: 90,
      });
    } catch {
      // 若 DEM 查询超时或离线，平滑降级到几何可见性
      return initialList.map(({ geometricallyPossible: _, ...rest }) => rest);
    }

    if (signal.aborted) return [];

    // 3. 逐个山峰做视线仰角遮挡计算
    peakSampleRanges.forEach(({ peakIdx, startIdx, count }) => {
      const p = needLosCheck[peakIdx]!;
      const distM = p.distance * 1000;
      // 目标山峰在考虑地球曲率后的有效仰角
      const peakCurvatureDropM = (distM * distM) / (2 * R);
      const peakEffectiveElev = p.elevation - peakCurvatureDropM;
      const peakAngle = Math.atan2(peakEffectiveElev - totalObsHeight, distM);

      let isObstructed = false;
      for (let s = 0; s < count; s++) {
        const ele = sampleElevations[startIdx + s];
        if (ele === null || ele === undefined || !Number.isFinite(ele)) continue;

        const frac = sampleFractions[s]!;
        const sampleDistM = distM * frac;
        const sampleCurvatureDropM = (sampleDistM * sampleDistM) / (2 * R);
        const sampleEffectiveElev = ele - sampleCurvatureDropM;
        const sampleAngle = Math.atan2(sampleEffectiveElev - totalObsHeight, sampleDistM);

        // 如果途中某个山脊或地形的视线仰角超过了目标山峰的视线仰角，则发生遮挡
        if (sampleAngle > peakAngle + 1e-5) {
          isObstructed = true;
          break;
        }
      }

      if (isObstructed) {
        p.visible = false;
      }
    });

    return initialList.map(({ geometricallyPossible: _, ...rest }) => rest);
  }

  private async findHighestPoint(
    viewPoint: LngLat,
    existingController?: AbortController,
  ): Promise<void> {
    const controller = existingController ?? new AbortController();
    if (!existingController) {
      this.searchController?.abort();
      this.searchController = controller;
      this._searching = true;
      this.notify();
    }

    try {
      const gridSize = 11;
      const radiusKm = Math.min(50, this._searchRadius);
      const latSpan = radiusKm / 111.32;
      const lngSpan = latSpan / Math.max(0.2, Math.cos((viewPoint[1] * Math.PI) / 180));
      const points: LngLat[] = [];
      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          points.push([
            viewPoint[0] - lngSpan + (2 * lngSpan * col) / (gridSize - 1),
            viewPoint[1] + latSpan - (2 * latSpan * row) / (gridSize - 1),
          ]);
        }
      }

      const elevations = await queryElevations(points, {
        signal: controller.signal,
        resolutionMeters: (radiusKm * 2000) / (gridSize - 1),
      });
      if (
        controller.signal.aborted ||
        this._viewPoint?.[0] !== viewPoint[0] ||
        this._viewPoint?.[1] !== viewPoint[1]
      )
        return;

      let highestIndex = -1;
      let highestElevation = -Infinity;
      elevations.forEach((elevation, index) => {
        if (elevation !== null && elevation > highestElevation) {
          highestElevation = elevation;
          highestIndex = index;
        }
      });
      if (highestIndex >= 0) {
        const coordinate = points[highestIndex]!;
        const distKm = haversine(viewPoint[1], viewPoint[0], coordinate[1], coordinate[0]);
        const distM = distKm * 1000;
        const dropM = (distM * distM) / (2 * 6_371_000);
        const pitchAngle = Number(((Math.atan2(highestElevation - dropM - (this._observerElevation + this._observerHeight), distM) * 180) / Math.PI).toFixed(2));
        this._peaks = [
          {
            name: '当前区域最高点',
            lng: coordinate[0],
            lat: coordinate[1],
            elevation: highestElevation,
            distance: distKm,
            bearing: computeBearing(viewPoint[1], viewPoint[0], coordinate[1], coordinate[0]),
            pitchAngle,
            visible: true,
            source: 'dem',
          },
        ];
      }
    } catch (error) {
      if (!controller.signal.aborted) console.warn('[PeakFinder] DEM fallback failed:', error);
    } finally {
      if (!existingController && this.searchController === controller) {
        this.searchController = null;
        this._searching = false;
        this.notify();
      }
    }
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
  }

  deactivate(): void {
    this.searchController?.abort();
    this.searchController = null;
    this._searching = false;
    this.active = false;
    this.ctx = null;
    this._viewPoint = null;
    this._peaks = [];
    this._observerElevation = 0;
  }

  isActive(): boolean {
    return this.active;
  }
}

// ---- utils ----

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLng);
  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}
