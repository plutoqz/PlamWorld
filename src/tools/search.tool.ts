// tools/search.tool.ts — 地名搜索工具 (MapTool)
// 激活后执行 Nominatim 地名搜索，匹配到首个结果后飞行动画定位

import { getEngine } from '../hooks/useMap';
import type { MapTool, ToolContext } from '../core/tools';

export class SearchTool implements MapTool {
  readonly id = 'search';
  readonly name = '搜索定位';
  readonly icon = '🔍';
  readonly category = 'navigation';
  readonly description = '搜索全球地名（基于 OpenStreetMap Nominatim），飞行动画移动到搜索结果';
  readonly exclusive = false;

  private active = false;
  private abortController: AbortController | null = null;

  /** 执行搜索（供外部直接调用，也可通过 ToolRegistry.activate 间接调用） */
  search(query: string, _ctx?: ToolContext): void {
    const trimmed = query.trim();
    if (!trimmed) return;

    // 取消旧的请求
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.active = true;

    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=1`,
      { signal: this.abortController.signal },
    )
      .then((r) => r.json())
      .then((results: any[]) => {
        if (results.length > 0) {
          const { lon, lat } = results[0];
          const engine = getEngine();
          engine?.flyTo([parseFloat(lon), parseFloat(lat)], 14);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('[SearchTool] 搜索失败:', err);
        }
      })
      .finally(() => {
        this.active = false;
        this.abortController = null;
      });
  }

  activate(_ctx: ToolContext): void {
    // SearchTool 通过 search() 方法触发，activate 只标记上下文就绪
    // 实际的搜索由 SearchBar 组件触发
    this.active = true;
    // 不在这里自动搜索 — 等待 SearchBar 调用 search()
  }

  deactivate(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }
}
