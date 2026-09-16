// core/geology.ts — 地质剖面数据 & Macrostrat API 封装 (v0.6)
//
// 数据源：Macrostrat API v2
//   GET /api/v2/geologic_units?lat=...&lng=...&radius=...
//   → 岩层信息（名称、年代、岩性、厚度等）
//
// 降级方案：内置代表性地质剖面数据

// ---- 类型 ----

/** 岩性分类 */
export type Lithology =
  | 'sandstone'
  | 'limestone'
  | 'shale'
  | 'granite'
  | 'basalt'
  | 'gneiss'
  | 'schist'
  | 'marble'
  | 'quartzite'
  | 'conglomerate'
  | 'siltstone'
  | 'dolomite'
  | 'clay'
  | 'gravel'
  | 'loess'
  | 'coal'
  | 'unknown';

/** 地质年代 */
export type GeologicEra =
  | 'Quaternary'
  | 'Neogene'
  | 'Paleogene'
  | 'Cretaceous'
  | 'Jurassic'
  | 'Triassic'
  | 'Permian'
  | 'Carboniferous'
  | 'Devonian'
  | 'Silurian'
  | 'Ordovician'
  | 'Cambrian'
  | 'Precambrian';

/** 岩层单元 */
export interface GeoUnit {
  /** 地层名称，如 "Morrison Formation" */
  name: string;
  /** 地质年代 */
  era: GeologicEra;
  /** 岩性 */
  lithology: Lithology;
  /** 顶面深度 (m, 负值表示地下) */
  topDepthM: number;
  /** 底面深度 (m, 负值表示地下) */
  bottomDepthM: number;
  /** 地层厚度 (m) */
  thicknessM: number;
  /** 简短描述 */
  description?: string;
}

/** 地质剖面点 */
export interface GeoProfilePoint {
  /** 地表高程 (m) */
  surfaceElevationM: number;
  /** 距离起点的距离 (km) */
  distanceKm: number;
  /** 该点下方的岩层序列（从地表向下排列） */
  units: GeoUnit[];
}

/** 地质剖面 */
export interface GeoProfile {
  /** 剖面线坐标 */
  line: [lng: number, lat: number][];
  /** 沿线采样点 */
  points: GeoProfilePoint[];
  /** 总长度 (km) */
  totalLengthKm: number;
  /** 所有岩层（去重） */
  allUnits: GeoUnit[];
}

// ---- 岩性配色 ----

export const LITHOLOGY_COLORS: Record<Lithology, string> = {
  sandstone:    '#E8C36A',
  limestone:    '#87CEEB',
  shale:        '#8B7355',
  granite:      '#E88D8D',
  basalt:       '#555555',
  gneiss:       '#A0A0A0',
  schist:       '#C0A0C0',
  marble:       '#F0E0D0',
  quartzite:    '#D4C8A8',
  conglomerate: '#C8A060',
  siltstone:    '#A89878',
  dolomite:     '#9CC4E4',
  clay:         '#C8B898',
  gravel:       '#B0A080',
  loess:        '#E8D8A0',
  coal:         '#333333',
  unknown:      '#CCCCCC',
};

export const LITHOLOGY_LABELS: Record<Lithology, string> = {
  sandstone:    '砂岩',
  limestone:    '石灰岩',
  shale:        '页岩',
  granite:      '花岗岩',
  basalt:       '玄武岩',
  gneiss:       '片麻岩',
  schist:       '片岩',
  marble:       '大理石',
  quartzite:    '石英岩',
  conglomerate: '砾岩',
  siltstone:    '粉砂岩',
  dolomite:     '白云岩',
  clay:         '黏土',
  gravel:       '砂砾',
  loess:        '黄土',
  coal:         '煤',
  unknown:      '未知',
};

// ---- 地质年代配色 ----

export const ERA_COLORS: Record<GeologicEra, string> = {
  Quaternary:    '#FFF2AE',
  Neogene:       '#FFE619',
  Paleogene:     '#FD9A52',
  Cretaceous:    '#7FC64E',
  Jurassic:      '#34B2C9',
  Triassic:      '#812B92',
  Permian:       '#F04028',
  Carboniferous: '#67A599',
  Devonian:      '#CB8C37',
  Silurian:      '#B3E1BB',
  Ordovician:    '#009270',
  Cambrian:      '#7FA056',
  Precambrian:   '#F5A48C',
};

export const ERA_LABELS: Record<GeologicEra, string> = {
  Quaternary:    '第四纪',
  Neogene:       '新近纪',
  Paleogene:     '古近纪',
  Cretaceous:    '白垩纪',
  Jurassic:      '侏罗纪',
  Triassic:      '三叠纪',
  Permian:       '二叠纪',
  Carboniferous: '石炭纪',
  Devonian:      '泥盆纪',
  Silurian:      '志留纪',
  Ordovician:    '奥陶纪',
  Cambrian:      '寒武纪',
  Precambrian:   '前寒武纪',
};

// ---- Macrostrat API 查询 ----

const MACROSTRAT_BASE = 'https://macrostrat.org/api/v2';

/** 查询某点的地质单元，返回 { units, source } */
export async function fetchGeoUnits(
  lng: number,
  lat: number,
  _radiusKm = 5,
): Promise<{ units: GeoUnit[]; source: 'api' | 'mock'; error?: string }> {
  // 1. 尝试区域详细地层柱 (Measured Sections / Stratigraphic Columns)
  try {
    const url = `${MACROSTRAT_BASE}/units?lat=${lat}&lng=${lng}&response=long`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawUnits: any[] = data.success?.data ?? [];
      if (rawUnits.length > 0) {
        // 按年代由新到老排序（t_age 升序）
        rawUnits.sort((a, b) => (Number(a.t_age) || 0) - (Number(b.t_age) || 0));
        let currDepth = 0;
        const units: GeoUnit[] = rawUnits.slice(0, 6).map((item) => {
          const rawThick = Number(item.max_thick) || (Number(item.b_age) > 0 ? 80 : 50);
          const thicknessM = Math.min(500, Math.max(25, rawThick));
          const top = -currDepth;
          currDepth += thicknessM;

          let lithText = '';
          if (Array.isArray(item.lith) && item.lith.length > 0) {
            lithText = item.lith[0].name || item.lith[0].lith || '';
          } else if (typeof item.lith === 'string') {
            lithText = item.lith;
          }
          const lithology = classifyLithology(lithText);
          const era = classifyEra(item.b_age ?? item.t_int_name ?? item.b_int_name);
          let name = item.strat_name_long || item.strat_name || item.unit_name || '';
          if (!name || name === 'Unnamed') {
            name = `${ERA_LABELS[era]} ${LITHOLOGY_LABELS[lithology]}层`;
          }

          return {
            name,
            era,
            lithology,
            topDepthM: top,
            bottomDepthM: -currDepth,
            thicknessM,
            description: item.notes || item.outcrop ? `露头: ${item.outcrop}` : undefined,
          };
        });

        if (units.length > 0) {
          return { units, source: 'api' };
        }
      }
    }
  } catch {
    // 忽略异常，继续尝试空间地质图查询
  }

  // 2. 尝试空间地层图源查询 (map_query_v2: z=10 高精度 → z=4 全球概略)
  for (const z of [10, 4]) {
    try {
      const url = `${MACROSTRAT_BASE}/mobile/map_query_v2?lat=${lat}&lng=${lng}&z=${z}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapData: any[] = data.success?.data?.mapData ?? [];
        if (mapData.length > 0) {
          const item = mapData[0];
          const era = classifyEra(item.b_int?.b_age ?? item.b_int?.int_name ?? item.age);
          let currDepth = 0;

          // 若包含多岩性，拆解为竖直层序
          if (Array.isArray(item.liths) && item.liths.length > 1) {
            const liths = item.liths.slice(0, 5);
            const totalThick = Math.min(
              600,
              Math.max(150, Number(item.macrostrat?.max_thick) || liths.length * 60),
            );
            const subThick = Math.round(totalThick / liths.length);
            const units: GeoUnit[] = liths.map((l: { lith?: string; name?: string }) => {
              const top = -currDepth;
              currDepth += subThick;
              const cl = classifyLithology(l.lith || l.name || '');
              const baseName = item.strat_name || item.name || '地层单元';
              const name = `${baseName} (${LITHOLOGY_LABELS[cl]})`;
              return {
                name,
                era,
                lithology: cl,
                topDepthM: top,
                bottomDepthM: -currDepth,
                thicknessM: subThick,
                description: item.descrip || item.comments || `${item.name || ''} (${item.age || ''})`,
              };
            });
            return { units, source: 'api' };
          }

          // 单一岩性或无详细岩性
          const cl = classifyLithology(item.liths?.[0]?.lith || item.lith || '');
          let baseName = item.strat_name || item.name || '';
          if (!baseName || baseName === 'Unnamed') {
            baseName = `${ERA_LABELS[era]} ${LITHOLOGY_LABELS[cl]}层`;
          }
          return {
            units: [
              {
                name: baseName,
                era,
                lithology: cl,
                topDepthM: 0,
                bottomDepthM: -200,
                thicknessM: 200,
                description: item.descrip || item.comments || `${item.name || ''} (${item.age || ''})`,
              },
            ],
            source: 'api',
          };
        }
      }
    } catch {
      // 忽略，继续
    }
  }

  // 3. 降级：无数据或公海
  return { units: [], source: 'mock', error: '当前区域无 Macrostrat 地质测绘数据' };
}

/** 根据年龄(百万年或文本)推断地质年代 */
export function classifyEra(age: number | string | undefined): GeologicEra {
  if (typeof age === 'string') {
    const s = age.toLowerCase();
    if (s.includes('quatern') || s.includes('holocene') || s.includes('pleistocene')) return 'Quaternary';
    if (s.includes('neogene') || s.includes('pliocene') || s.includes('miocene')) return 'Neogene';
    if (s.includes('paleogene') || s.includes('oligocene') || s.includes('eocene') || s.includes('paleocene')) return 'Paleogene';
    if (s.includes('cenozoic')) return 'Neogene';
    if (s.includes('cretaceous')) return 'Cretaceous';
    if (s.includes('jurassic')) return 'Jurassic';
    if (s.includes('triassic')) return 'Triassic';
    if (s.includes('mesozoic')) return 'Jurassic';
    if (s.includes('permian')) return 'Permian';
    if (s.includes('carboniferous') || s.includes('pennsylvanian') || s.includes('mississippian')) return 'Carboniferous';
    if (s.includes('devonian')) return 'Devonian';
    if (s.includes('silurian')) return 'Silurian';
    if (s.includes('ordovician')) return 'Ordovician';
    if (s.includes('cambrian')) return 'Cambrian';
    if (s.includes('paleozoic')) return 'Devonian';
    if (s.includes('precambrian') || s.includes('proterozoic') || s.includes('archean')) return 'Precambrian';
  }
  const ageMa = typeof age === 'number' ? age : Number(age) || 500;
  if (ageMa < 2.58) return 'Quaternary';
  if (ageMa < 23) return 'Neogene';
  if (ageMa < 66) return 'Paleogene';
  if (ageMa < 145) return 'Cretaceous';
  if (ageMa < 201) return 'Jurassic';
  if (ageMa < 252) return 'Triassic';
  if (ageMa < 299) return 'Permian';
  if (ageMa < 359) return 'Carboniferous';
  if (ageMa < 419) return 'Devonian';
  if (ageMa < 443) return 'Silurian';
  if (ageMa < 485) return 'Ordovician';
  if (ageMa < 541) return 'Cambrian';
  return 'Precambrian';
}

/** 岩性文本 → Lithology 枚举 */
export function classifyLithology(text: string): Lithology {
  const lower = text.toLowerCase();
  if (lower.includes('sandstone') || lower.includes('sand') || lower.includes('arenite')) return 'sandstone';
  if (lower.includes('limestone') || lower.includes('lime') || lower.includes('chalk') || lower.includes('calc')) return 'limestone';
  if (lower.includes('shale') || lower.includes('mudstone') || lower.includes('slate') || lower.includes('claystone') || lower.includes('argillite')) return 'shale';
  if (lower.includes('granite') || lower.includes('granodiorite') || lower.includes('pegmatite') || lower.includes('plutonic') || lower.includes('intrusive')) return 'granite';
  if (lower.includes('basalt') || lower.includes('andesite') || lower.includes('rhyolite') || lower.includes('volcanic') || lower.includes('extrusive') || lower.includes('dolerite') || lower.includes('gabbro')) return 'basalt';
  if (lower.includes('gneiss')) return 'gneiss';
  if (lower.includes('schist') || lower.includes('phyllite') || lower.includes('metamorphic')) return 'schist';
  if (lower.includes('marble')) return 'marble';
  if (lower.includes('quartzite') || lower.includes('chert') || lower.includes('quartz')) return 'quartzite';
  if (lower.includes('conglomerate') || lower.includes('breccia')) return 'conglomerate';
  if (lower.includes('siltstone') || lower.includes('silt')) return 'siltstone';
  if (lower.includes('dolomite') || lower.includes('dolostone') || lower.includes('gypsum') || lower.includes('evaporite') || lower.includes('anhydrite')) return 'dolomite';
  if (lower.includes('clay') || lower.includes('marl')) return 'clay';
  if (lower.includes('gravel') || lower.includes('alluvium') || lower.includes('colluvium') || lower.includes('debris')) return 'gravel';
  if (lower.includes('loess') || lower.includes('silt-sand')) return 'loess';
  if (lower.includes('coal') || lower.includes('lignite') || lower.includes('anthracite') || lower.includes('peat')) return 'coal';
  if (lower.includes('sedimentary')) return 'sandstone';
  return 'unknown';
}

// ---- 内置模拟地质柱 —— 当 API 不可用时使用 ----

/**
 * 根据经纬度生成模拟的岩层柱状图
 * 使用经纬度的数值特征来生成确定性的"伪地质"数据
 */
export function generateMockGeology(lng: number, lat: number): GeoUnit[] {
  // 用经纬度生成确定性种子
  const seed = Math.abs(Math.sin(lng * 3.14159 * 1000) * Math.cos(lat * 2.71828 * 1000));
  const layerCount = 2 + Math.floor(seed * 4); // 2-5 层

  const lithologies: Lithology[] = [
    'sandstone', 'limestone', 'shale', 'granite', 'basalt',
    'gneiss', 'marble', 'conglomerate', 'siltstone', 'dolomite',
  ];

  const eras: GeologicEra[] = [
    'Quaternary', 'Cretaceous', 'Jurassic', 'Triassic',
    'Permian', 'Carboniferous', 'Devonian', 'Cambrian',
  ];

  const units: GeoUnit[] = [];
  let currentDepth = 0;

  for (let i = 0; i < layerCount; i++) {
    const thickness = 20 + Math.abs(Math.sin(seed * (i + 2.718)) * 150);
    const lithIdx = Math.floor(Math.abs(Math.sin(seed * (i + 3.14159)) * lithologies.length));
    const eraIdx = Math.floor(Math.abs(Math.cos(seed * (i + 1.618)) * eras.length));

    units.push({
      name: `${ERA_LABELS[eras[eraIdx]!]} ${LITHOLOGY_LABELS[lithologies[lithIdx]!]}`,
      era: eras[eraIdx]!,
      lithology: lithologies[lithIdx]!,
      topDepthM: -currentDepth,
      bottomDepthM: -(currentDepth + thickness),
      thicknessM: thickness,
      description: `模拟地质数据 — ${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E`,
    });
    currentDepth += thickness;
  }

  return units;
}

// ---- 剖面渲染数据生成 ----

export interface ProfileRenderData {
  /** Canvas 宽度 (px) */
  width: number;
  /** Canvas 高度 (px) */
  height: number;
  /** 地表线 (y 坐标数组，从上到下为正) */
  surface: number[];
  /** 岩层多边形：每个岩层 [ [x1,y1], [x2,y2], [x2,y3], [x1,y4] ] */
  layers: Array<{
    unit: GeoUnit;
    polygons: Array<[number, number][]>;
    labelX?: number;
    labelY?: number;
  }>;
  /** X 轴标签 */
  xLabels: Array<{ x: number; text: string }>;
  /** Y 轴范围 */
  yRange: { min: number; max: number };
}
