// core/tools.ts — MapTool 插件接口 + ToolRegistry

import type { EngineKind } from './types';
import type { IMapEngine } from './engine';

// ---- 工具上下文 ----

/**
 * ToolContext — 工具激活时注入的上下文
 * 工具通过 ctx 获取引擎引用和 store，不直接 import store 模块
 * 这保证工具可以独立测试
 */
export interface ToolContext {
  engine: IMapEngine;
}

// ---- 工具分类 ----

/**
 * 工具功能分类
 * 用于 ToolSidebar 分组展示
 */
export type ToolCategory =
  | 'navigation'    // 导航定位
  | 'measurement'   // 测量分析
  | 'visualization' // 专题可视化
  | 'simulation'    // 场景模拟
  | 'comparison'    // 对比探索
  | 'story';        // 叙事展示

/** 分类中文标签 — 供 UI 引用 */
export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  navigation: '导航定位',
  measurement: '测量分析',
  visualization: '专题可视化',
  simulation: '场景模拟',
  comparison: '对比探索',
  story: '叙事展示',
};

// ---- 工具接口 ----

export interface MapTool {
  /** 唯一标识 */
  readonly id: string;
  /** 工具名称 (中文) */
  readonly name: string;
  /** lucide-react 图标名 */
  readonly icon: string;
  /** 简短描述 */
  readonly description: string;
  /** 功能分类 */
  readonly category: ToolCategory;
  /** 引擎依赖声明：null = 不依赖特定引擎 */
  readonly requiresEngine?: EngineKind;
  /** 激活时是否停用其他 exclusive 工具 */
  readonly exclusive?: boolean;

  /** 激活工具 */
  activate(ctx: ToolContext): void;
  /** 停用工具 */
  deactivate(): void;
  /** 是否当前激活中 */
  isActive(): boolean;
}

// ---- 工具注册中心 ----

export class ToolRegistry {
  private tools = new Map<string, MapTool>();
  private activeToolId: string | null = null;

  /** 注册一个工具 */
  register(tool: MapTool): void {
    if (this.tools.has(tool.id)) {
      console.warn(`[ToolRegistry] 工具 ${tool.id} 已注册，将被覆盖`);
    }
    this.tools.set(tool.id, tool);
  }

  /** 批量注册 */
  registerAll(tools: MapTool[]): void {
    tools.forEach((t) => this.register(t));
  }

  /** 激活工具 */
  activate(toolId: string, ctx: ToolContext): void {
    const tool = this.tools.get(toolId);
    if (!tool) {
      console.error(`[ToolRegistry] 工具 ${toolId} 不存在`);
      return;
    }

    // 停用当前活跃工具
    this.deactivate();

    tool.activate(ctx);
    this.activeToolId = toolId;
  }

  /** 停用当前工具 */
  deactivate(): void {
    if (this.activeToolId) {
      const tool = this.tools.get(this.activeToolId);
      tool?.deactivate();
      this.activeToolId = null;
    }
  }

  /** 获取已注册工具列表 (UI 用) */
  list(): MapTool[] {
    return Array.from(this.tools.values());
  }

  /** 按分类获取工具列表 */
  listByCategory(): Map<ToolCategory, MapTool[]> {
    const map = new Map<ToolCategory, MapTool[]>();
    for (const tool of this.tools.values()) {
      const items = map.get(tool.category);
      if (items) {
        items.push(tool);
      } else {
        map.set(tool.category, [tool]);
      }
    }
    return map;
  }

  /** 获取已注册工具的分类列表（按定义顺序） */
  getCategories(): ToolCategory[] {
    const seen = new Set<ToolCategory>();
    const order: ToolCategory[] = [];
    for (const tool of this.tools.values()) {
      if (!seen.has(tool.category)) {
        seen.add(tool.category);
        order.push(tool.category);
      }
    }
    return order;
  }

  /** 当前活跃工具 ID */
  getActiveId(): string | null {
    return this.activeToolId;
  }

  /** 获取特定工具 */
  get(toolId: string): MapTool | undefined {
    return this.tools.get(toolId);
  }
}
