import { useMemo, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { useMapStore } from '@stores/mapStore';
import { useUIStore } from '@stores/uiStore';
import { toolRegistry } from '@tools/registry';
import { CATEGORY_LABELS } from '@core/tools';
import { getEngine } from '@hooks/useMap';
import { CATEGORY_ICONS, ToolIcon } from '@components/ui/ToolIcon';
import type { MapTool, ToolCategory } from '@core/tools';

const CATEGORY_ORDER: ToolCategory[] = [
  'navigation',
  'measurement',
  'visualization',
  'simulation',
  'comparison',
  'story',
];

interface ToolSidebarProps {
  open: boolean;
}

export function ToolSidebar({ open }: ToolSidebarProps) {
  const engineReady = useMapStore((state) => state.engineReady);
  const activeToolId = useUIStore((state) => state.activeToolId);
  const setActiveTool = useUIStore((state) => state.setActiveTool);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<ToolCategory>>(new Set());

  const groupedTools = useMemo(() => {
    const byCategory = toolRegistry.listByCategory();
    const query = searchQuery.trim().toLowerCase();
    const result: { category: ToolCategory; tools: MapTool[] }[] = [];

    for (const category of CATEGORY_ORDER) {
      const tools = byCategory.get(category) ?? [];
      const filtered = query
        ? tools.filter((tool) =>
            `${tool.name} ${tool.description} ${tool.id}`.toLowerCase().includes(query),
          )
        : tools;
      if (filtered.length) result.push({ category, tools: filtered });
    }
    return result;
  }, [searchQuery]);

  const handleToolClick = (toolId: string) => {
    const engine = getEngine();
    if (!engine) return;

    if (activeToolId === toolId) {
      toolRegistry.deactivate();
      setActiveTool(null);
    } else {
      toolRegistry.activate(toolId, { engine });
      setActiveTool(toolId);
    }

    if (window.innerWidth < 900) setSidebarOpen(false);
  };

  const toggleCategory = (category: ToolCategory) => {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <aside className={`pw-sidebar ${open ? 'is-open' : ''}`} aria-label="地图工具">
      <div className="pw-sidebar-header">
        <div>
          <strong>工具</strong>
          <span className={engineReady ? 'is-ready' : ''}>
            {engineReady ? '引擎就绪' : '正在连接'}
          </span>
        </div>
        <div className="pw-tool-filter">
          <Search size={15} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="筛选工具"
            aria-label="筛选工具"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              title="清空筛选"
              aria-label="清空筛选"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <nav className="pw-tool-list">
        {groupedTools.length === 0 ? (
          <div className="pw-empty-state">没有匹配的工具</div>
        ) : (
          groupedTools.map(({ category, tools }) => {
            const collapsed = collapsedCategories.has(category);
            const CategoryIcon = CATEGORY_ICONS[category];
            const hasActive = tools.some((tool) => tool.id === activeToolId);
            return (
              <section className="pw-tool-group" key={category}>
                <button
                  type="button"
                  className={`pw-tool-group-button ${hasActive ? 'has-active' : ''}`}
                  onClick={() => toggleCategory(category)}
                >
                  <CategoryIcon size={14} strokeWidth={1.8} />
                  <span>{CATEGORY_LABELS[category]}</span>
                  <small>{tools.length}</small>
                  <ChevronRight size={14} className={collapsed ? '' : 'is-expanded'} />
                </button>

                {!collapsed && (
                  <div className="pw-tool-items">
                    {tools.map((tool) => {
                      const active = tool.id === activeToolId;
                      return (
                        <button
                          type="button"
                          key={tool.id}
                          title={tool.description}
                          className={`pw-tool-item ${active ? 'is-active' : ''}`}
                          onClick={() => handleToolClick(tool.id)}
                          disabled={!engineReady}
                          aria-disabled={!engineReady}
                        >
                          <span className="pw-tool-item-icon">
                            <ToolIcon toolId={tool.id} />
                          </span>
                          <span className="pw-tool-item-copy">
                            <strong>{tool.name}</strong>
                            <small>{tool.description}</small>
                          </span>
                          {active && <span className="pw-active-indicator" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}
      </nav>

      <footer className="pw-sidebar-footer">
        <span>PalmWorld</span>
        <span>v0.6</span>
      </footer>
    </aside>
  );
}
