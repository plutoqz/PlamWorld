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
