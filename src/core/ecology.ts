// core/ecology.ts — 生态 & 生物多样性数据 (v0.6)
//
// 内置精选物种分布 + 迁徙路线
// 数据来源参考：IUCN Red List / GBIF / BirdLife International

import type { Polygon, LineString } from 'geojson';

// ---- 类型 ----

export type IUCNStatus = 'CR' | 'EN' | 'VU' | 'NT' | 'LC';

export const IUCN_LABELS: Record<IUCNStatus, string> = {
  CR: '极危 Critically Endangered',
  EN: '濒危 Endangered',
  VU: '易危 Vulnerable',
  NT: '近危 Near Threatened',
  LC: '无危 Least Concern',
};

export const IUCN_COLORS: Record<IUCNStatus, string> = {
  CR: '#e74c3c',
  EN: '#e67e22',
  VU: '#f1c40f',
  NT: '#2ecc71',
  LC: '#3498db',
};

export type SpeciesCategory = 'mammal' | 'bird' | 'reptile' | 'amphibian' | 'fish' | 'plant';

export const CATEGORY_LABELS: Record<SpeciesCategory, string> = {
  mammal: '哺乳类',
  bird: '鸟类',
  reptile: '爬行类',
  amphibian: '两栖类',
  fish: '鱼类',
  plant: '植物',
};

export interface SpeciesDef {
  id: string;
  name: string;
  nameZh: string;
  category: SpeciesCategory;
  iucnStatus: IUCNStatus;
  /** 简化分布范围 */
  distribution: Polygon;
  /** 描述 */
  description: string;
  /** 种群趋势 */
  trend: 'increasing' | 'stable' | 'decreasing' | 'unknown';
}

export interface MigrationRoute {
  id: string;
  name: string;
  nameZh: string;
  speciesId: string;
  /** 迁徙路线 */
  path: LineString;
  /** 季节性描述 */
  season: string;
  description: string;
}

// ---- 内置物种数据 (简化分布范围) ----

export const SPECIES: SpeciesDef[] = [
  {
    id: 'giant-panda',
    name: 'Giant Panda',
    nameZh: '大熊猫',
    category: 'mammal',
    iucnStatus: 'VU',
    description: '中国特有物种，栖息于四川、陕西、甘肃的温带竹林。',
    trend: 'increasing',
    distribution: {
      type: 'Polygon',
      coordinates: [
        [
          [102, 30],
          [105, 30],
          [107, 31],
          [108, 33],
          [107, 34],
          [105, 34],
          [103, 33],
          [102, 31],
          [102, 30],
        ],
      ],
    },
  },
  {
    id: 'snow-leopard',
    name: 'Snow Leopard',
    nameZh: '雪豹',
    category: 'mammal',
    iucnStatus: 'VU',
    description: '栖息于中亚和南亚高山地区，海拔3000-4500米。',
    trend: 'decreasing',
    distribution: {
      type: 'Polygon',
      coordinates: [
        [
          [72, 35],
          [85, 35],
          [95, 32],
          [105, 30],
          [105, 28],
          [78, 28],
          [72, 30],
          [72, 35],
        ],
      ],
    },
  },
  {
    id: 'siberian-tiger',
    name: 'Siberian Tiger',
    nameZh: '东北虎',
    category: 'mammal',
    iucnStatus: 'EN',
    description: '现存最大的猫科动物，分布于俄罗斯远东和中国东北。',
    trend: 'stable',
    distribution: {
      type: 'Polygon',
      coordinates: [
        [
          [128, 42],
          [138, 42],
          [140, 46],
          [138, 48],
          [130, 48],
          [128, 45],
          [128, 42],
        ],
      ],
    },
  },
  {
    id: 'golden-monkey',
    name: 'Golden Snub-nosed Monkey',
    nameZh: '金丝猴',
    category: 'mammal',
    iucnStatus: 'EN',
    description: '中国特有灵长类，分布于四川、甘肃、陕西和湖北的温带山地森林。',
    trend: 'decreasing',
    distribution: {
      type: 'Polygon',
      coordinates: [
        [
          [104, 31],
          [110, 31],
          [112, 34],
          [111, 35],
          [105, 35],
          [103, 33],
          [104, 31],
        ],
      ],
    },
  },
  {
    id: 'red-crowned-crane',
    name: 'Red-crowned Crane',
    nameZh: '丹顶鹤',
    category: 'bird',
    iucnStatus: 'VU',
    description: '东亚特有的大型涉禽，繁殖于东北亚湿地，越冬于中国东部沿海。',
    trend: 'decreasing',
    distribution: {
      type: 'Polygon',
      coordinates: [
        [
          [120, 32],
          [135, 32],
          [145, 43],
          [143, 48],
          [130, 48],
          [120, 40],
          [120, 32],
        ],
      ],
    },
  },
  {
    id: 'crested-ibis',
    name: 'Crested Ibis',
    nameZh: '朱鹮',
    category: 'bird',
    iucnStatus: 'EN',
    description: '一度被认为野外灭绝，1981年在陕西洋县重新发现。',
    trend: 'increasing',
    distribution: {
      type: 'Polygon',
      coordinates: [
        [
          [106, 32],
          [109, 32],
          [110, 34],
          [108, 35],
          [106, 34],
          [106, 32],
        ],
      ],
    },
  },
  {
    id: 'chinese-alligator',
    name: 'Chinese Alligator',
    nameZh: '扬子鳄',
    category: 'reptile',
    iucnStatus: 'CR',
    description: '中国特有的小型鳄鱼，仅分布于长江下游流域。',
    trend: 'decreasing',
    distribution: {
      type: 'Polygon',
      coordinates: [
        [
          [116, 30],
          [120, 30],
          [121, 32],
          [118, 33],
          [116, 31],
          [116, 30],
        ],
      ],
    },
  },
  {
    id: 'giant-salamander',
    name: 'Chinese Giant Salamander',
    nameZh: '大鲵（娃娃鱼）',
    category: 'amphibian',
    iucnStatus: 'CR',
    description: '世界上最大的两栖动物，分布于中国中部和南部山区溪流。',
    trend: 'decreasing',
    distribution: {
      type: 'Polygon',
      coordinates: [
        [
          [104, 25],
          [116, 25],
          [118, 32],
          [110, 34],
          [104, 30],
          [104, 25],
        ],
      ],
    },
  },
  {
    id: 'chinese-sturgeon',
    name: 'Chinese Sturgeon',
    nameZh: '中华鲟',
    category: 'fish',
    iucnStatus: 'CR',
    description: '洄游性鱼类，在长江上游产卵，大海中生长。三峡大坝建成后产卵地丧失。',
    trend: 'decreasing',
    distribution: {
      type: 'Polygon',
      coordinates: [
        [
          [106, 29],
          [122, 29],
          [122, 32],
          [106, 32],
          [106, 29],
        ],
      ],
    },
  },
  {
    id: 'dove-tree',
    name: 'Dove Tree (Davidia)',
    nameZh: '珙桐（鸽子树）',
    category: 'plant',
    iucnStatus: 'VU',
    description: '活化石植物，分布于四川、湖北、湖南、贵州山区。',
    trend: 'stable',
    distribution: {
      type: 'Polygon',
      coordinates: [
        [
          [102, 27],
          [112, 27],
          [112, 32],
          [102, 32],
          [102, 27],
        ],
      ],
    },
  },
  {
    id: 'african-elephant',
    name: 'African Elephant',
    nameZh: '非洲象',
    category: 'mammal',
    iucnStatus: 'EN',
    description: '现存最大的陆地动物，分布于撒哈拉以南非洲。',
    trend: 'decreasing',
    distribution: {
      type: 'Polygon',
      coordinates: [
        [
          [14, -25],
          [40, -25],
          [42, 5],
          [32, 15],
          [14, 10],
          [10, 0],
          [14, -25],
        ],
      ],
    },
  },
  {
    id: 'blue-whale',
    name: 'Blue Whale',
    nameZh: '蓝鲸',
    category: 'mammal',
    iucnStatus: 'EN',
    description: '地球上最大的动物，全球海洋分布。',
    trend: 'increasing',
    distribution: {
      type: 'Polygon',
      coordinates: [
        [
          [-180, -70],
          [180, -70],
          [180, 70],
          [-180, 70],
          [-180, -70],
        ],
      ],
    },
  },
];

// ---- 迁徙路线 ----

export const MIGRATION_ROUTES: MigrationRoute[] = [
  {
    id: 'eaaf',
    name: 'East Asian-Australasian Flyway',
    nameZh: '东亚-澳大利亚候鸟迁飞通道',
    speciesId: 'red-crowned-crane',
    description: '全球最重要的候鸟迁飞通道之一，每年约5000万只候鸟经此迁徙。',
    season: '春秋迁徙季',
    path: {
      type: 'LineString',
      coordinates: [
        [130, 50],
        [128, 45],
        [125, 40],
        [122, 35],
        [120, 30],
        [118, 25],
        [110, 20],
        [108, 10],
        [106, 0],
        [115, -8],
        [130, -12],
        [145, -17],
        [150, -25],
        [148, -33],
        [145, -38],
      ],
    },
  },
  {
    id: 'arctic-tern',
    name: 'Arctic Tern Migration',
    nameZh: '北极燕鸥迁徙路线',
    speciesId: '',
    description: '地球上最长的迁徙路线，每年往返北极和南极约70,000公里。',
    season: '全年循环',
    path: {
      type: 'LineString',
      coordinates: [
        [-55, 72],
        [-50, 65],
        [-40, 55],
        [-30, 40],
        [-25, 25],
        [-20, 10],
        [-18, 0],
        [-20, -10],
        [-25, -20],
        [-30, -35],
        [-35, -50],
        [-40, -60],
        [-50, -68],
      ],
    },
  },
  {
    id: 'monarch-butterfly',
    name: 'Monarch Butterfly Migration',
    nameZh: '帝王蝶迁徙路线',
    speciesId: '',
    description: '北美洲帝王蝶每年从加拿大南部迁徙至墨西哥中部过冬。',
    season: '秋季南迁 / 春季北返',
    path: {
      type: 'LineString',
      coordinates: [
        [-95, 50],
        [-93, 45],
        [-90, 40],
        [-88, 35],
        [-90, 30],
        [-95, 25],
        [-100, 20],
        [-102, 19],
      ],
    },
  },
  {
    id: 'wildebeest',
    name: 'Serengeti Wildebeest Migration',
    nameZh: '塞伦盖蒂角马大迁徙',
    speciesId: '',
    description: '每年约150万头角马在塞伦盖蒂和马赛马拉之间循环迁徙。',
    season: '全年循环',
    path: {
      type: 'LineString',
      coordinates: [
        [34.5, -1.5],
        [34.8, -2.0],
        [35.2, -2.5],
        [35.5, -2.8],
        [35.8, -2.5],
        [35.5, -2.0],
        [35.2, -2.0],
        [35.0, -2.2],
        [34.5, -1.5],
      ],
    },
  },
  {
    id: 'humpback-whale',
    name: 'Humpback Whale Migration',
    nameZh: '座头鲸迁徙路线',
    speciesId: 'blue-whale',
    description: '座头鲸每年从阿拉斯加觅食区迁徙至夏威夷繁殖区。',
    season: '冬春季',
    path: {
      type: 'LineString',
      coordinates: [
        [-155, 58],
        [-152, 50],
        [-150, 42],
        [-148, 35],
        [-150, 28],
        [-155, 22],
        [-157, 20],
      ],
    },
  },
];

// ---- GBIF API 全球生物多样性实地观测查询 ----

export interface GBIFOccurrence {
  key: number;
  scientificName: string;
  vernacularName?: string;
  species?: string;
  genus?: string;
  family?: string;
  order?: string;
  class?: string;
  kingdom?: string;
  category: SpeciesCategory;
  iucnStatus: IUCNStatus;
  lat: number;
  lng: number;
  eventDate?: string;
  mediaUrl?: string;
  recordedBy?: string;
  basisOfRecord?: string;
  datasetName?: string;
}

export interface GBIFSearchParams {
  bounds: [minLng: number, minLat: number, maxLng: number, maxLat: number];
  category?: SpeciesCategory | 'all';
  iucnStatus?: IUCNStatus[];
  hasMediaOnly?: boolean;
  limit?: number;
  signal?: AbortSignal;
}

export async function searchGBIFOccurrences(
  params: GBIFSearchParams,
): Promise<{ occurrences: GBIFOccurrence[]; count: number }> {
  const [minLng, minLat, maxLng, maxLat] = params.bounds;
  const limit = Math.min(50, params.limit ?? 25);

  const url = new URL('https://api.gbif.org/v1/occurrence/search');
  url.searchParams.set('decimalLatitude', `${minLat.toFixed(4)},${maxLat.toFixed(4)}`);
  url.searchParams.set('decimalLongitude', `${minLng.toFixed(4)},${maxLng.toFixed(4)}`);
  url.searchParams.set('hasCoordinate', 'true');
  if (params.hasMediaOnly ?? true) {
    url.searchParams.set('hasMedia', 'true');
  }
  url.searchParams.set('limit', String(limit));

  if (params.category && params.category !== 'all') {
    switch (params.category) {
      case 'mammal':
        url.searchParams.set('class', 'Mammalia');
        break;
      case 'bird':
        url.searchParams.set('class', 'Aves');
        break;
      case 'reptile':
        url.searchParams.set('class', 'Reptilia');
        break;
      case 'amphibian':
        url.searchParams.set('class', 'Amphibia');
        break;
      case 'fish':
        url.searchParams.set('class', 'Actinopterygii');
        break;
      case 'plant':
        url.searchParams.set('kingdom', 'Plantae');
        break;
    }
  }

  const resp = await fetch(url.toString(), {
    signal: params.signal ?? AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`GBIF HTTP ${resp.status}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await resp.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = data.results ?? [];

  const occurrences: GBIFOccurrence[] = results
    .filter((item) => item.decimalLatitude != null && item.decimalLongitude != null)
    .map((item) => {
      // 分类判定
      let cat: SpeciesCategory = 'mammal';
      const c = (item.class || '').toLowerCase();
      const k = (item.kingdom || '').toLowerCase();
      if (k === 'plantae') cat = 'plant';
      else if (c.includes('aves') || c.includes('bird')) cat = 'bird';
      else if (c.includes('reptil')) cat = 'reptile';
      else if (c.includes('amphib')) cat = 'amphibian';
      else if (
        c.includes('actinopterygii') ||
        c.includes('fish') ||
        c.includes('chondrichthyes')
      )
        cat = 'fish';
      else cat = 'mammal';

      // 红色名录等级
      const rawIucn = (item.iucnRedListCategory || '').toUpperCase();
      let iucn: IUCNStatus = 'LC';
      if (['CR', 'EN', 'VU', 'NT', 'LC'].includes(rawIucn)) {
        iucn = rawIucn as IUCNStatus;
      }

      // 媒体照片
      let mediaUrl: string | undefined;
      if (Array.isArray(item.media) && item.media.length > 0) {
        mediaUrl = item.media[0].identifier;
      }

      return {
        key: item.key,
        scientificName: item.scientificName || item.species || '未知物种',
        vernacularName: item.vernacularName,
        species: item.species,
        genus: item.genus,
        family: item.family,
        order: item.order,
        class: item.class,
        kingdom: item.kingdom,
        category: cat,
        iucnStatus: iucn,
        lat: item.decimalLatitude,
        lng: item.decimalLongitude,
        eventDate: item.eventDate,
        mediaUrl,
        recordedBy: item.recordedBy,
        basisOfRecord: item.basisOfRecord,
        datasetName: item.datasetName,
      };
    });

  // 若设置了 IUCN 过滤
  const filtered =
    params.iucnStatus && params.iucnStatus.length > 0
      ? occurrences.filter((o) => params.iucnStatus!.includes(o.iucnStatus))
      : occurrences;

  return {
    occurrences: filtered,
    count: data.count ?? occurrences.length,
  };
}

// ---- 全球生物多样性保护热点 (Biodiversity Hotspots) ----

export interface BiodiversityHotspot {
  id: string;
  name: string;
  nameZh: string;
  threatLevel: 'Critical' | 'High';
  areaKm2: number;
  speciesRichness: number;
  endemicSpecies: number;
  keyReserves: string[];
  polygon: Polygon;
  description: string;
}

export const BIODIVERSITY_HOTSPOTS: BiodiversityHotspot[] = [
  {
    id: 'sw-china',
    name: 'Mountains of Southwest China',
    nameZh: '中国西南山地热点',
    threatLevel: 'Critical',
    areaKm2: 262000,
    speciesRichness: 12000,
    endemicSpecies: 3500,
    keyReserves: ['卧龙国家级自然保护区', '九寨沟保护区', '三江并流世界自然遗产', '稻城亚丁保护区'],
    description: '涵盖四川西部、云南西北部和西藏东南部横断山脉，是全球温带针阔混交林植物区系最丰富区域，也是大熊猫、川金丝猴、雪豹的核心家园。',
    polygon: {
      type: 'Polygon',
      coordinates: [[
        [98.0, 24.5], [103.5, 25.5], [105.0, 29.5], [104.5, 33.5],
        [102.0, 34.5], [97.5, 32.5], [96.0, 29.0], [98.0, 24.5],
      ]],
    },
  },
  {
    id: 'himalaya',
    name: 'Himalaya Hotspot',
    nameZh: '喜马拉雅生物多样性热点',
    threatLevel: 'Critical',
    areaKm2: 741000,
    speciesRichness: 10000,
    endemicSpecies: 3160,
    keyReserves: ['珠穆朗玛峰国家级自然保护区', '雅鲁藏布大峡谷保护区', '萨加玛塔国家公园'],
    description: '横跨喜马拉雅山脉南北两麓，垂直高差悬殊，从亚热带雨林到永久冰雪带，保存有极为丰富的古老高山孑遗动植物群落。',
    polygon: {
      type: 'Polygon',
      coordinates: [[
        [74.0, 35.5], [80.0, 31.0], [88.0, 28.5], [95.5, 29.5],
        [96.5, 27.5], [89.0, 26.5], [80.0, 28.0], [74.0, 33.5], [74.0, 35.5],
      ]],
    },
  },
  {
    id: 'indo-burma',
    name: 'Indo-Burma Hotspot',
    nameZh: '印缅热点 (滇南与中南半岛)',
    threatLevel: 'Critical',
    areaKm2: 2373000,
    speciesRichness: 13500,
    endemicSpecies: 7000,
    keyReserves: ['西双版纳热带雨林国家级保护区', '高黎贡山自然保护区', '考艾国家公园'],
    description: '包含云南南部、西双版纳与整个中南半岛，拥有全球最丰富多样的热带季雨林群落，亚洲象、绿孔雀、白颊长臂猿的关键庇护地。',
    polygon: {
      type: 'Polygon',
      coordinates: [[
        [92.5, 22.0], [98.0, 25.5], [101.5, 23.0], [108.5, 21.5],
        [107.0, 10.5], [100.0, 8.5], [98.0, 15.0], [92.5, 22.0],
      ]],
    },
  },
  {
    id: 'congo-basin',
    name: 'Congo Basin Forests',
    nameZh: '刚果盆地热带雨林',
    threatLevel: 'High',
    areaKm2: 1780000,
    speciesRichness: 11000,
    endemicSpecies: 2300,
    keyReserves: ['维龙加国家公园 (Virunga)', '萨隆加国家公园 (Salonga)', '奥扎拉国家公园'],
    description: '世界第二大连续热带雨林，被称为非洲的绿色心脏，是山地大猩猩、倭黑猩猩、非洲森林象的核心栖息家园。',
    polygon: {
      type: 'Polygon',
      coordinates: [[
        [11.0, 3.5], [18.0, 5.0], [28.0, 4.0], [30.0, -1.5],
        [27.0, -7.0], [18.0, -5.0], [12.0, -2.0], [11.0, 3.5],
      ]],
    },
  },
  {
    id: 'madagascar',
    name: 'Madagascar & Indian Ocean Islands',
    nameZh: '马达加斯加与印度洋岛屿群',
    threatLevel: 'Critical',
    areaKm2: 592000,
    speciesRichness: 14000,
    endemicSpecies: 11600,
    keyReserves: ['马索亚拉国家公园', '安达西贝-曼塔迪亚保护区', '贝马拉哈清真石林'],
    description: '与大陆隔离近9000万年，孕育了极高的特有物种率（植物89%、爬行动物92%、哺乳动物全部狐猴特有）。',
    polygon: {
      type: 'Polygon',
      coordinates: [[
        [43.0, -12.0], [49.5, -12.0], [50.5, -15.5], [48.0, -25.5],
        [44.0, -25.5], [43.5, -20.0], [43.0, -12.0],
      ]],
    },
  },
  {
    id: 'amazon-basin',
    name: 'Amazon Rainforest',
    nameZh: '亚马孙热带雨林大宝库',
    threatLevel: 'High',
    areaKm2: 6700000,
    speciesRichness: 40000,
    endemicSpecies: 25000,
    keyReserves: ['雅乌国家公园 (Jaú)', '马努国家公园 (Manu)', '马米拉瓦保护区'],
    description: '全球面积最大、生物多样性最丰富的热带雨林，拥有全球10%的已知物种，是地球最重要的碳汇与气候调节器。',
    polygon: {
      type: 'Polygon',
      coordinates: [[
        [-76.0, 3.0], [-60.0, 5.0], [-50.0, 1.0], [-48.0, -4.0],
        [-52.0, -12.0], [-64.0, -15.0], [-74.0, -10.0], [-78.0, -4.0], [-76.0, 3.0],
      ]],
    },
  },
  {
    id: 'coral-triangle',
    name: 'Coral Triangle & Great Barrier Reef',
    nameZh: '珊瑚大三角与大堡礁',
    threatLevel: 'Critical',
    areaKm2: 6000000,
    speciesRichness: 6000,
    endemicSpecies: 2200,
    keyReserves: ['大堡礁海洋公园 (GBR)', '四王群岛海洋保护区 (Raja Ampat)', '图巴塔哈群礁'],
    description: '全球海洋生物多样性中心，拥有全球76%的造礁珊瑚物种和3000多种珊瑚礁鱼类，海洋生态系统的孕育摇篮。',
    polygon: {
      type: 'Polygon',
      coordinates: [[
        [118.0, 18.0], [130.0, 10.0], [152.0, -5.0], [153.0, -24.0],
        [142.0, -20.0], [130.0, -10.0], [115.0, -8.0], [110.0, 4.0], [118.0, 18.0],
      ]],
    },
  },
  {
    id: 'sundaland',
    name: 'Sundaland',
    nameZh: '巽他古陆 (婆罗洲与马来群岛雨林)',
    threatLevel: 'Critical',
    areaKm2: 1500000,
    speciesRichness: 25000,
    endemicSpecies: 15000,
    keyReserves: ['古农列尤择国家公园', '京那巴鲁公园', '丹绒普丁国家公园'],
    description: '涵盖苏门答腊、爪哇、婆罗洲和马来半岛，红毛猩猩、苏门答腊犀、大王花的栖息地，正面临油棕种植与森林退化威胁。',
    polygon: {
      type: 'Polygon',
      coordinates: [[
        [95.0, 6.0], [104.0, 6.0], [118.0, 6.5], [119.0, -4.0],
        [114.0, -8.5], [105.0, -7.0], [96.0, -2.0], [95.0, 6.0],
      ]],
    },
  },
];


