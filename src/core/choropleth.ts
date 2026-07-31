// core/choropleth.ts — Choropleth 专题地图核心引擎
//
// 提供：
//   1. 分类引擎（等间隔 / 分位数 / Jenks / 自定义 / 连续）
//   2. 色阶映射（单色序 / 发散 / 多色序 — ColorBrewer 启发的内建方案）
//   3. 区域名模糊匹配引擎（精确 → 别名 → Levenshtein → 手动修正）
//
// 纯函数，不依赖浏览器 DOM，可直接在 Worker 中运行。
// 依赖：fuse.js（模糊匹配）、simple-statistics（Jenks 断点）

import Fuse from 'fuse.js';
import { jenks } from 'simple-statistics';

// ---- 类型 ----

/** 用户数据中的一行 */
export type DataRow = Record<string, string | number>;

/** 解析后的数据集（列名 + 行） */
export interface ParsedData {
  columns: string[];
  rows: DataRow[];
  rowCount: number;
}

/** 区域匹配结果 */
export interface MatchResult {
  input: string;
  matched: string | null;
  score: number; // 0-1，1 = 精确
  candidates: string[];
}

/** 分类方法 */
export type ClassifyMethod = 'equal' | 'quantile' | 'jenks' | 'manual' | 'continuous';

/** 色阶类型 */
export type ColorSchemeType = 'sequential' | 'diverging' | 'multi-hue';

/** 色阶方案元数据 */
export interface ColorScheme {
  id: string;
  name: string;
  type: ColorSchemeType;
  colors: string[]; // hex
  minColors: number;
  maxColors: number;
}

/** Choropleth 完整配置 */
export interface ChoroplethConfig {
  /** 区域名→数值的映射表 */
  regionValues: Map<string, number>;
  /** 区域名→GeoJSON feature 的映射表（由边界数据提供） */
  regionFeatures: Map<string, GeoJSON.Feature>;
  /** 分类方法 */
  method: ClassifyMethod;
  /** 分段数（continuous 模式忽略） */
  k: number;
  /** 手动断点（manual 模式） */
  manualBreaks: number[];
  /** 色阶 */
  colorSchemeId: string;
  /** 当 method='continuous' 时的值域 */
  valueRange: [number, number];
}

// ---- 分类器 ----

/**
 * 等间隔分类
 * @returns k-1 个断点（不含 min/max 边界）
 */
export function equalInterval(values: number[], k: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) return Array.from({ length: k - 1 }, (_, i) => min + ((i + 1) * 0.001));
  const step = (max - min) / k;
  return Array.from({ length: k - 1 }, (_, i) => min + step * (i + 1));
}

/**
 * 分位数分类：每类包含大致相同数量的样本
 * @returns k-1 个断点
 */
export function quantile(values: number[], k: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return [];
  const breaks: number[] = [];
  for (let i = 1; i < k; i++) {
    const idx = Math.floor((n * i) / k);
    breaks.push(sorted[Math.min(idx, n - 1)]);
  }
  // 去重：合并相同断点
  return [...new Set(breaks)].filter((_, _i, arr) => arr.length < k);
}

/**
 * Jenks 自然断点：最小化类内方差
 * 委托 simple-statistics
 * @returns k-1 个断点
 */
export function jenksNaturalBreaks(values: number[], k: number): number[] {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length <= k) {
    // 太少的唯一值，退化为等间隔
    return equalInterval(values, k);
  }
  try {
    const breaks = jenks(values, k);
    if (breaks) {
      // simple-statistics 的 jenks 返回包含 min/max 的完整断点数组
      // 去掉首尾（那是值域范围，不是我们要的内部断点）
      return breaks.slice(1, breaks.length - 1);
    }
  } catch {
    // Jenks 计算失败（样本太少），降级为等间隔
  }
  return equalInterval(values, k);
}

/**
 * 根据方法分类
 * @returns k-1 个断点 + 值域 [min, max]
 */
export function classify(
  values: number[],
  method: ClassifyMethod,
  k: number,
  manualBreaks: number[] = [],
): { breaks: number[]; range: [number, number] } {
  const filtered = values.filter((v) => typeof v === 'number' && !isNaN(v));
  if (filtered.length === 0) return { breaks: [], range: [0, 1] };

  const min = Math.min(...filtered);
  const max = Math.max(...filtered);

  if (method === 'manual' && manualBreaks.length > 0) {
    return {
      breaks: [...manualBreaks].sort((a, b) => a - b),
      range: [min, max],
    };
  }
  if (method === 'continuous') {
    return { breaks: [], range: [min, max] };
  }
  if (method === 'jenks') {
    return { breaks: jenksNaturalBreaks(filtered, k), range: [min, max] };
  }
  if (method === 'quantile') {
    return { breaks: quantile(filtered, k), range: [min, max] };
  }
  // default: equal interval
  return { breaks: equalInterval(filtered, k), range: [min, max] };
}

// ---- 色阶 ----

// 手动内建常用 ColorBrewer 色阶，避免额外依赖 d3-scale-chromatic
// 每个方案提供 3-9 个颜色，interpolateColor() 做线性插值
export const COLOR_SCHEMES: ColorScheme[] = [
  // ---- Sequential (单色序) ----
  { id: 'blues', name: '蓝色序', type: 'sequential', colors: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'], minColors: 3, maxColors: 9 },
  { id: 'reds', name: '红色序', type: 'sequential', colors: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2d', '#cb181d', '#a50f15', '#67000d'], minColors: 3, maxColors: 9 },
  { id: 'greens', name: '绿色序', type: 'sequential', colors: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b'], minColors: 3, maxColors: 9 },
  { id: 'purples', name: '紫色序', type: 'sequential', colors: ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#54278f', '#3f007d'], minColors: 3, maxColors: 9 },
  { id: 'oranges', name: '橙色序', type: 'sequential', colors: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#a63603', '#7f2704'], minColors: 3, maxColors: 9 },
  { id: 'greys', name: '灰色序', type: 'sequential', colors: ['#ffffff', '#f0f0f0', '#d9d9d9', '#bdbdbd', '#969696', '#737373', '#525252', '#252525', '#000000'], minColors: 3, maxColors: 9 },
  // ---- Multi-hue Sequential ----
  { id: 'ylorrd', name: '黄-橙-红', type: 'multi-hue', colors: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'], minColors: 3, maxColors: 9 },
  { id: 'ylgnbu', name: '黄-绿-蓝', type: 'multi-hue', colors: ['#ffffd9', '#edf8b1', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#253494', '#081d58'], minColors: 3, maxColors: 9 },
  { id: 'viridis', name: 'Viridis', type: 'multi-hue', colors: ['#fde725', '#b5de2b', '#6ece58', '#35b779', '#1f9e89', '#26828e', '#31688e', '#3e4989', '#482878'], minColors: 3, maxColors: 9 },
  { id: 'magma', name: 'Magma', type: 'multi-hue', colors: ['#fcfdbf', '#fec98f', '#fd9567', '#f1605d', '#cd4071', '#a12e7c', '#721f81', '#41127d', '#0b0a6e'], minColors: 3, maxColors: 9 },
  // ---- Diverging (发散) ----
  { id: 'rdbu', name: '红-蓝 发散', type: 'diverging', colors: ['#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac'], minColors: 3, maxColors: 9 },
  { id: 'rdylgn', name: '红-绿 发散', type: 'diverging', colors: ['#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850'], minColors: 3, maxColors: 9 },
  { id: 'brbg', name: '棕-绿 发散', type: 'diverging', colors: ['#a6611a', '#dfc27d', '#f5f5f5', '#80cdc1', '#018571'], minColors: 3, maxColors: 5 },
  { id: 'piyg', name: '粉-绿 发散', type: 'diverging', colors: ['#c51b7d', '#e9a3c9', '#fde0ef', '#f7f7f7', '#e6f5d0', '#a1d76a', '#4d9221'], minColors: 3, maxColors: 7 },
  { id: 'puor', name: '紫-橙 发散', type: 'diverging', colors: ['#b35806', '#f1a340', '#fee0b6', '#f7f7f7', '#d8daeb', '#998ec3', '#542788'], minColors: 3, maxColors: 7 },
];

/**
 * 查找色阶方案
 */
export function findColorScheme(id: string): ColorScheme | undefined {
  return COLOR_SCHEMES.find((s) => s.id === id);
}

/**
 * 从色阶中取 k 个颜色（最大努力分布在色阶中）
 */
export function pickColors(scheme: ColorScheme, k: number): string[] {
  const { colors } = scheme;
  const n = Math.max(scheme.minColors, Math.min(k, scheme.maxColors, colors.length));
  if (n >= colors.length) return [...colors];
  // 均匀采样
  const step = (colors.length - 1) / (n - 1);
  const result: string[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round(i * step);
    result.push(colors[idx]);
  }
  return result;
}

/**
 * 在两个颜色之间做线性插值
 */
export function interpolateColor(c1: string, c2: string, t: number): string {
  const r1 = parseInt(c1.slice(1, 3), 16);
  const g1 = parseInt(c1.slice(3, 5), 16);
  const b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16);
  const g2 = parseInt(c2.slice(3, 5), 16);
  const b2 = parseInt(c2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * 根据值、断点、色阶，返回颜色 hex
 */
export function colorForValue(
  value: number,
  breaks: number[],
  range: [number, number],
  colors: string[],
): string {
  if (breaks.length === 0) {
    // continuous mode：在色阶中线性插值
    const t = range[1] === range[0] ? 0.5 : (value - range[0]) / (range[1] - range[0]);
    const clamped = Math.max(0, Math.min(1, t));
    const idx = clamped * (colors.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, colors.length - 1);
    return interpolateColor(colors[lo], colors[hi], idx - lo);
  }

  // 分段模式
  if (breaks.length === 0) return colors[0] ?? '#cccccc';

  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return colors[i] ?? '#cccccc';
  }
  return colors[colors.length - 1] ?? '#cccccc';
}

// ---- 区域匹配引擎 ----

/** 常用中文区域名别名 */
const NAME_ALIASES: Record<string, string> = {
  '北京': '北京市', '北京市': '北京市',
  '天津': '天津市', '天津市': '天津市',
  '上海': '上海市', '上海市': '上海市',
  '重庆': '重庆市', '重庆市': '重庆市',
  '河北': '河北省', '河北省': '河北省',
  '山西': '山西省', '山西省': '山西省',
  '辽宁': '辽宁省', '辽宁省': '辽宁省',
  '吉林': '吉林省', '吉林省': '吉林省',
  '黑龙江': '黑龙江省', '黑龙江省': '黑龙江省',
  '江苏': '江苏省', '江苏省': '江苏省',
  '浙江': '浙江省', '浙江省': '浙江省',
  '安徽': '安徽省', '安徽省': '安徽省',
  '福建': '福建省', '福建省': '福建省',
  '江西': '江西省', '江西省': '江西省',
  '山东': '山东省', '山东省': '山东省',
  '河南': '河南省', '河南省': '河南省',
  '湖北': '湖北省', '湖北省': '湖北省',
  '湖南': '湖南省', '湖南省': '湖南省',
  '广东': '广东省', '广东省': '广东省',
  '海南': '海南省', '海南省': '海南省',
  '四川': '四川省', '四川省': '四川省',
  '贵州': '贵州省', '贵州省': '贵州省',
  '云南': '云南省', '云南省': '云南省',
  '陕西': '陕西省', '陕西省': '陕西省',
  '甘肃': '甘肃省', '甘肃省': '甘肃省',
  '青海': '青海省', '青海省': '青海省',
  '台湾': '台湾省', '台湾省': '台湾省',
  '内蒙古': '内蒙古自治区', '内蒙古自治区': '内蒙古自治区',
  '广西': '广西壮族自治区', '广西壮族自治区': '广西壮族自治区',
  '西藏': '西藏自治区', '西藏自治区': '西藏自治区',
  '宁夏': '宁夏回族自治区', '宁夏回族自治区': '宁夏回族自治区',
  '新疆': '新疆维吾尔自治区', '新疆维吾尔自治区': '新疆维吾尔自治区',
  '香港': '香港特别行政区', '香港特别行政区': '香港特别行政区',
  '澳门': '澳门特别行政区', '澳门特别行政区': '澳门特别行政区',
};

/**
 * 对用户提供的区域名列表与边界属性名列表做模糊匹配
 *
 * @param inputs  用户数据中的区域名
 * @param targets 边界数据中的区域名
 * @returns 匹配结果列表
 */
export function matchRegions(inputs: string[], targets: string[]): MatchResult[] {
  // Fuse 配置：主要搜索 targets
  const fuse = new Fuse(
    targets.map((t) => ({ name: t })),
    {
      keys: ['name'],
      threshold: 0.4,
      includeScore: true,
      minMatchCharLength: 1,
    },
  );

  return inputs.map((input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      return { input, matched: null, score: 0, candidates: [] };
    }

    // 1. 精确匹配（忽略大小写）
    const exact = targets.find((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (exact) {
      return { input: trimmed, matched: exact, score: 1, candidates: [] };
    }

    // 2. 别名替换后再精确匹配
    const alias = NAME_ALIASES[trimmed] ?? NAME_ALIASES[trimmed.replace(/\s/g, '')] ?? trimmed;
    if (alias !== trimmed) {
      const aliasMatch = targets.find((t) => t.toLowerCase() === alias.toLowerCase());
      if (aliasMatch) {
        return { input: trimmed, matched: aliasMatch, score: 1, candidates: [] };
      }
    }

    // 3. 包含匹配（输入是目标的子串）
    const contains = targets.filter(
      (t) =>
        t.toLowerCase().includes(trimmed.toLowerCase()) ||
        trimmed.toLowerCase().includes(t.toLowerCase()),
    );
    if (contains.length === 1) {
      return { input: trimmed, matched: contains[0], score: 0.9, candidates: contains };
    }

    // 4. Fuse 模糊匹配
    const result = fuse.search(trimmed);
    if (result.length > 0 && result[0].score !== undefined) {
      const score = 1 - result[0].score; // Fuse score 越小越好，转为 0-1
      const candidates = result.slice(0, 5).map((r) => r.item.name);
      if (score > 0.6) {
        return { input: trimmed, matched: candidates[0], score, candidates };
      }
      return { input: trimmed, matched: null, score, candidates };
    }

    // 5. 无匹配
    return { input: trimmed, matched: null, score: 0, candidates: [] };
  });
}

/**
 * 简易 Levenshtein 距离（fallback，不依赖 fuse.js 的场合可用）
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}
