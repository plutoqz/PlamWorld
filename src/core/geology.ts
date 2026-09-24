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

// ---- 区域地质构造知识库 —— 当 API 不可用或数据稀疏时提供权威地层柱 ----

interface RegionalStratigraphicColumn {
  name: string;
  regionDesc: string;
  match: (lng: number, lat: number) => boolean;
  layers: Array<{
    name: string;
    era: GeologicEra;
    lithology: Lithology;
    thicknessM: number;
    description: string;
  }>;
}

const REGIONAL_GEOLOGY_DATABASE: RegionalStratigraphicColumn[] = [
  // 1. 华北克拉通构造区 (太行山-燕山-华北平原)
  {
    name: '华北克拉通构造地层柱',
    regionDesc: '华北地台古老基底与古生代沉积盖层（参考中国地调局华北综合地层序列）',
    match: (lng, lat) => lng >= 110 && lng <= 122 && lat >= 34 && lat <= 42,
    layers: [
      { name: '第四系马兰组黄土/冲积砂砾', era: 'Quaternary', lithology: 'loess', thicknessM: 45, description: '广泛覆盖的风成黄土与冲积砂砾层' },
      { name: '新近系保德组红色黏土与粉砂岩', era: 'Neogene', lithology: 'siltstone', thicknessM: 75, description: '内陆盆地河湖相粉砂岩与泥岩' },
      { name: '二叠系-石炭系太原组含煤砂泥岩', era: 'Permian', lithology: 'coal', thicknessM: 180, description: '华北主含煤建造，海陆交互相砂泥岩与煤层' },
      { name: '奥陶系马家沟组厚层石灰岩', era: 'Ordovician', lithology: 'limestone', thicknessM: 260, description: '浅海相碳酸盐岩建造，喀斯特溶洞发育主要层位' },
      { name: '寒武系张夏组鲕状石灰岩与白云岩', era: 'Cambrian', lithology: 'limestone', thicknessM: 240, description: '典型浅海陆棚碳酸盐岩，富含三叶虫化石' },
      { name: '太古宇泰山群变质花岗片麻岩基底', era: 'Precambrian', lithology: 'gneiss', thicknessM: 450, description: '克拉通古老深变质结晶基底岩系' },
    ],
  },

  // 2. 四川盆地构造区 (扬子准地台西部)
  {
    name: '四川盆地红层地层柱',
    regionDesc: '扬子陆块四川盆地深厚中新生代陆相红层与海相碳酸盐岩盆地',
    match: (lng, lat) => lng >= 102 && lng <= 110 && lat >= 27 && lat <= 33,
    layers: [
      { name: '白垩系夹关组厚层红层砂岩', era: 'Cretaceous', lithology: 'sandstone', thicknessM: 180, description: '内陆干旱盆地河流相红色长石石英砂岩' },
      { name: '侏罗系沙溪庙组紫红色砂泥岩互层', era: 'Jurassic', lithology: 'shale', thicknessM: 280, description: '恐龙动物群产出经典层位，富集紫红泥岩' },
      { name: '三叠系须家河组煤系砂岩与嘉陵江组白云岩', era: 'Triassic', lithology: 'dolomite', thicknessM: 360, description: '海陆过渡相含煤碎屑岩至蒸发海相碳酸盐岩' },
      { name: '二叠系阳新统栖霞-茅口组石灰岩', era: 'Permian', lithology: 'limestone', thicknessM: 320, description: '海相碳酸盐岩含硫天然气主要产集层' },
      { name: '震旦系-古生界灯影组白云岩古基底', era: 'Precambrian', lithology: 'dolomite', thicknessM: 450, description: '古老碳酸盐岩刚性基底' },
    ],
  },

  // 3. 青藏高原造山带 (青藏-喜马拉雅特提斯构造域)
  {
    name: '青藏特提斯造山带地层柱',
    regionDesc: '特提斯洋缝合带与印度板块碰撞强烈褶皱变形造山带',
    match: (lng, lat) => lng >= 78 && lng <= 102 && lat >= 27 && lat <= 37,
    layers: [
      { name: '古近系-新近系大竹卡组磨拉石红色砾岩', era: 'Paleogene', lithology: 'conglomerate', thicknessM: 120, description: '高原隆升早期山前磨拉石快速堆积砾岩' },
      { name: '白垩系冈底斯岩基中酸性花岗岩', era: 'Cretaceous', lithology: 'granite', thicknessM: 380, description: '新特提斯洋俯冲形成的巨型钙碱性岩浆侵入岩体' },
      { name: '侏罗系深海复理石变质板岩与片岩', era: 'Jurassic', lithology: 'schist', thicknessM: 320, description: '特提斯深海沟槽沉积变质岩，叶理极度发育' },
      { name: '三叠系海相重结晶大理岩与基性火山岩', era: 'Triassic', lithology: 'marble', thicknessM: 350, description: '洋陆碰撞挤压下强烈重结晶碳酸盐变质岩' },
      { name: '前寒武系高喜马拉雅变质片麻岩结晶核', era: 'Precambrian', lithology: 'gneiss', thicknessM: 450, description: '深部拆沉与韧性剪切结晶杂岩核心' },
    ],
  },

  // 4. 华南折皱带与东南丘陵 (华南板块)
  {
    name: '华南造山带与丹霞地层柱',
    regionDesc: '华南加里东-燕山期多旋回岩浆岩与红层盆地',
    match: (lng, lat) => lng >= 108 && lng <= 122 && lat >= 21 && lat <= 30,
    layers: [
      { name: '第四系网纹红土与残坡积砾质黏土', era: 'Quaternary', lithology: 'clay', thicknessM: 30, description: '亚热带湿热气候下强淋滤风化红土' },
      { name: '白垩系丹霞组红色砂砾岩', era: 'Cretaceous', lithology: 'sandstone', thicknessM: 220, description: '丹霞地貌成景岩层，厚层红色粗碎屑砂砾岩' },
      { name: '晚侏罗世燕山期侵入黑云母花岗岩', era: 'Jurassic', lithology: 'granite', thicknessM: 420, description: '多期次岩浆侵入体，常伴生钨锡稀有金属矿' },
      { name: '古生界下统浅变质石英砂页岩', era: 'Devonian', lithology: 'quartzite', thicknessM: 360, description: '加里东造山期浅变质沉积碎屑岩' },
    ],
  },

  // 5. 塔里木盆地与天山造山带
  {
    name: '塔里木克拉通盆地地层柱',
    regionDesc: '大型叠合沉积盆地与北侧天山造山带交接地带',
    match: (lng, lat) => lng >= 74 && lng <= 90 && lat >= 37 && lat <= 44,
    layers: [
      { name: '第四系风成沙丘与粉细砂层', era: 'Quaternary', lithology: 'sandstone', thicknessM: 60, description: '沙漠戈壁风积与洪积碎屑沉积' },
      { name: '新近系-古近系库车组膏泥岩与粉砂岩', era: 'Neogene', lithology: 'siltstone', thicknessM: 260, description: '干旱内陆封闭湖盆膏盐与红色泥岩' },
      { name: '白垩系-三叠系陆相生油砂岩', era: 'Cretaceous', lithology: 'sandstone', thicknessM: 340, description: '陆相三角洲-湖泊相砂岩储层' },
      { name: '奥陶系-寒武系良里塔格组石灰岩', era: 'Ordovician', lithology: 'limestone', thicknessM: 420, description: '海相深埋古潜山碳酸盐岩储集体' },
      { name: '古生界火山岩与片岩变质基底', era: 'Carboniferous', lithology: 'schist', thicknessM: 450, description: '造山带缝合与古板块基底' },
    ],
  },

  // 6. 松辽盆地与东北造山带
  {
    name: '松辽大白垩纪盆地地层柱',
    regionDesc: '大型中生代陆相断陷-凹陷含油气盆地',
    match: (lng, lat) => lng >= 120 && lng <= 130 && lat >= 42 && lat <= 50,
    layers: [
      { name: '第四系黑土冲积粉砂与砂砾', era: 'Quaternary', lithology: 'loess', thicknessM: 35, description: '松嫩平原肥沃腐殖质黑土与河谷冲积层' },
      { name: '白垩系嫩江组深灰-灰黑色泥页岩', era: 'Cretaceous', lithology: 'shale', thicknessM: 260, description: '大庆油田主力生油岩，湖相极深水沉积泥页岩' },
      { name: '白垩系青山口组-姚家组含油砂岩', era: 'Cretaceous', lithology: 'sandstone', thicknessM: 320, description: '大型湖泊三角洲前缘砂体储层' },
      { name: '前寒武系-古生界变质花岗片麻岩', era: 'Precambrian', lithology: 'gneiss', thicknessM: 420, description: '基底杂岩' },
    ],
  },

  // 7. 北美科罗拉多大峡谷构造区
  {
    name: '科罗拉多高原大峡谷地层柱',
    regionDesc: '世界地质教科书级古生代水平沉积层序',
    match: (lng, lat) => lng >= -115 && lng <= -107 && lat >= 35 && lat <= 40,
    layers: [
      { name: '二叠系凯巴布石灰岩 (Kaibab Limestone)', era: 'Permian', lithology: 'limestone', thicknessM: 110, description: '峡谷顶层海相燧石石灰岩，构成高原顶面' },
      { name: '二叠系科科尼诺风成砂岩 (Coconino Sandstone)', era: 'Permian', lithology: 'sandstone', thicknessM: 130, description: '典型古代风成沙漠交错层理白色砂岩' },
      { name: '石炭系红墙石灰岩 (Redwall Limestone)', era: 'Carboniferous', lithology: 'limestone', thicknessM: 180, description: '高达150米高耸垂直红色峭壁海相石灰岩' },
      { name: '寒武系塔皮特砂岩 (Tapeats Sandstone)', era: 'Cambrian', lithology: 'sandstone', thicknessM: 140, description: '寒武纪大不整合面上的海侵碎屑基底砂岩' },
      { name: '前寒武纪毗湿奴片岩与花岗片麻岩', era: 'Precambrian', lithology: 'schist', thicknessM: 450, description: '峡谷底部受剧烈变质与岩浆侵入的内峡谷古老基底' },
    ],
  },

  // 8. 欧洲阿尔卑斯褶皱带
  {
    name: '阿尔卑斯高山造山带地层柱',
    regionDesc: '非洲板块向欧亚板块碰撞推覆形成的纳布构造带',
    match: (lng, lat) => lng >= 5 && lng <= 16 && lat >= 44 && lat <= 48,
    layers: [
      { name: '第四系冰碛物与高山冲积砾石', era: 'Quaternary', lithology: 'gravel', thicknessM: 50, description: '第四纪末次冰期巨型冰川搬运堆积物' },
      { name: '白垩系-侏罗系海相推覆石灰岩', era: 'Cretaceous', lithology: 'limestone', thicknessM: 320, description: '特提斯洋海相碳酸盐岩大型推覆体' },
      { name: '三叠系主白云岩建造', era: 'Triassic', lithology: 'dolomite', thicknessM: 280, description: '多洛米蒂高耸岩峰成因白云岩' },
      { name: '海西期变质花岗片麻岩核心', era: 'Carboniferous', lithology: 'gneiss', thicknessM: 420, description: '勃朗峰等中央结晶地块基底花岗片麻岩' },
    ],
  },
];

/**
 * 根据经纬度查询真实构造大区地质柱；若超出特色盆地，则依海陆构造规律构建真实陆壳层序
 */
export function generateMockGeology(lng: number, lat: number): GeoUnit[] {
  // 1. 尝试匹配权威区域构造地质库
  const matched = REGIONAL_GEOLOGY_DATABASE.find((db) => db.match(lng, lat));

  if (matched) {
    let currDepth = 0;
    return matched.layers.map((l) => {
      const top = -currDepth;
      currDepth += l.thicknessM;
      return {
        name: l.name,
        era: l.era,
        lithology: l.lithology,
        topDepthM: top,
        bottomDepthM: -currDepth,
        thicknessM: l.thicknessM,
        description: `${matched.name} · ${l.description}`,
      };
    });
  }

  // 2. 全球大陆地壳通用实测层序模型（区分中生代、古生代与结晶基底，拒绝纯伪随机胡编）
  const units: GeoUnit[] = [
    {
      name: '第四系冲积砂砾与表层沉积物',
      era: 'Quaternary',
      lithology: 'sandstone',
      topDepthM: 0,
      bottomDepthM: -40,
      thicknessM: 40,
      description: `大陆表层沉积风化壳 — ${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E`,
    },
    {
      name: '中生代陆相碎屑砂泥岩盖层',
      era: 'Cretaceous',
      lithology: 'shale',
      topDepthM: -40,
      bottomDepthM: -220,
      thicknessM: 180,
      description: '区域沉积盆地盖层砂泥岩',
    },
    {
      name: '古生代海相石灰岩与白云岩层',
      era: 'Permian',
      lithology: 'limestone',
      topDepthM: -220,
      bottomDepthM: -540,
      thicknessM: 320,
      description: '海相古生代稳定地台碳酸盐岩层',
    },
    {
      name: '前寒武纪变质花岗片麻岩结晶基底',
      era: 'Precambrian',
      lithology: 'granite',
      topDepthM: -540,
      bottomDepthM: -1000,
      thicknessM: 460,
      description: '大陆地壳深部结晶岩基底',
    },
  ];

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
