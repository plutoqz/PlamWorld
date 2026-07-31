// core/literary-map.ts — 文学地图框架核心接口 (v0.6)
//
// 设计理念：双空间耦合模型
//   Reality Space (MapLibre EPSG:3857) ↔ Fantasy Space (Canvas / 自定义投影)
//   通过 LiteraryAnchor 将文学世界的空间叙事锚定到真实地理坐标
//
// 首发实现：山海经
// 后续扩展：西游记 → 三国 → 金庸 → 指环王

// ---- 类型 ----

/** 锚点置信度等级 */
export type AnchorConfidence = 'exact' | 'approximate' | 'conjectural' | 'mythical';

export const CONFIDENCE_LABELS: Record<AnchorConfidence, string> = {
  exact: '精确对应',
  approximate: '区域对应',
  conjectural: '推测对应',
  mythical: '纯幻想',
};

export const CONFIDENCE_COLORS: Record<AnchorConfidence, string> = {
  exact: '#2ecc71',
  approximate: '#3498db',
  conjectural: '#f39c12',
  mythical: '#9b59b6',
};

/** 锚点类别 */
export type AnchorCategory =
  | 'mountain'
  | 'river'
  | 'lake'
  | 'country'
  | 'creature'
  | 'plant'
  | 'mineral'
  | 'character'
  | 'event'
  | 'route';

export const ANCHOR_CATEGORY_LABELS: Record<AnchorCategory, string> = {
  mountain: '山脉',
  river: '河流',
  lake: '湖泊',
  country: '邦国',
  creature: '异兽',
  plant: '草木',
  mineral: '金石',
  character: '人物',
  event: '事件',
  route: '路线',
};

/** 视觉风格 */
export type LiteraryVisualStyle =
  | 'ancient-chinese'
  | 'medieval'
  | 'sci-fi'
  | 'modern'
  | 'ink-wash'
  | 'watercolor'
  | 'custom';

/** 文学锚点：连接虚构地点与真实坐标 */
export interface LiteraryAnchor {
  id: string;
  /** 原文名称 */
  name: string;
  /** 中文名称 */
  nameZh?: string;
  /** 原文描述片段 */
  description: string;
  /** 类别 */
  category: AnchorCategory;

  /** 地理锚定置信度 */
  confidence: AnchorConfidence;
  /** 真实经纬度 — Level 1/2 */
  realCoord?: [lng: number, lat: number];
  /** 区域范围 — Level 2 */
  realBbox?: [[number, number], [number, number]];

  /** 幻想坐标 — Level 3/4 */
  fantasyCoord?: [x: number, y: number];

  /** 层级关系 */
  parentId?: string;
  /** 关联锚点 */
  relatedAnchors?: string[];
  /** 所属旅行路线 */
  travelRouteIds?: string[];

  /** 附加媒体 */
  illustrationUrl?: string;
  aiGeneratedUrl?: string;
}

/** 文学旅行路线 */
export interface LiteraryRoute {
  id: string;
  name: string;
  nameZh: string;
  anchorIds: string[];
  startAnchorId: string;
  endAnchorId: string;
  description: string;
  animated?: boolean;
}

/** 文学地图源 */
export interface ILiteraryMapSource {
  id: string;
  title: string;
  subtitle?: string;
  era?: string;
  author?: string;
  description: string;

  visualStyle: LiteraryVisualStyle;

  /** 核心数据 */
  anchors: LiteraryAnchor[];
  routes?: LiteraryRoute[];

  /** 可选自定义底图 */
  baseTileUrl?: string;
  baseTileAttribution?: string;

  /** 纯幻想世界范围 */
  worldBounds?: [[number, number], [number, number]];
}

// ---- 锚点检索帮助函数 ----

/** 按置信度分组 */
export function groupByConfidence(
  anchors: LiteraryAnchor[],
): Record<AnchorConfidence, LiteraryAnchor[]> {
  const groups: Record<AnchorConfidence, LiteraryAnchor[]> = {
    exact: [],
    approximate: [],
    conjectural: [],
    mythical: [],
  };
  for (const a of anchors) groups[a.confidence].push(a);
  return groups;
}

/** 按类别分组 */
export function groupByCategory(
  anchors: LiteraryAnchor[],
): Partial<Record<AnchorCategory, LiteraryAnchor[]>> {
  const groups: Partial<Record<AnchorCategory, LiteraryAnchor[]>> = {};
  for (const a of anchors) {
    if (!groups[a.category]) groups[a.category] = [];
    groups[a.category]!.push(a);
  }
  return groups;
}

/** 获取可在现实地图上渲染的锚点（Level 1-2） */
export function getRealAnchors(anchors: LiteraryAnchor[]): LiteraryAnchor[] {
  return anchors.filter(a => a.realCoord !== undefined);
}

/** 获取纯幻想锚点（Level 3-4） */
export function getFantasyAnchors(anchors: LiteraryAnchor[]): LiteraryAnchor[] {
  return anchors.filter(a => a.realCoord === undefined);
}
