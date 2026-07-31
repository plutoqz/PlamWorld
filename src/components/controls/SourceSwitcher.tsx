import { useEffect, useRef } from 'react';
import { Check, Database, Layers3, Map, Mountain, Satellite } from 'lucide-react';
import { useMapSource } from '../../hooks/useMapSource';
import { useUIStore } from '@stores/uiStore';

function SourceIcon({ id, category }: { id: string; category: string }) {
  if (id === 'pmtiles') return <Database size={17} />;
  if (category === 'satellite') return <Satellite size={17} />;
  if (category === 'topo') return <Mountain size={17} />;
  return <Map size={17} />;
}

export function SourceSwitcher() {
  const { sources, activeSource, switchSource, isActive } = useMapSource();
  const open = useUIStore((state) => state.sourcePanelOpen);
  const toggle = useUIStore((state) => state.toggleSourcePanel);
  const setOpen = useUIStore((state) => state.setSourcePanelOpen);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [setOpen]);

  return (
    <div className="pw-source-switcher" ref={rootRef}>
      <button
        type="button"
        className={`pw-topbar-button ${open ? 'is-active' : ''}`}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`切换图源，当前为${activeSource?.name ?? '未选择'}`}
        title="切换图源"
      >
        <Layers3 size={17} />
        <span>{activeSource?.name ?? '图源'}</span>
      </button>

      {open && (
        <div className="pw-source-menu" role="menu">
          <div className="pw-source-menu-heading">
            <span>地图图源</span>
            <small>{sources.length} 个可用</small>
          </div>
          {sources.map((source) => {
            const active = isActive(source.id);
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={active}
                key={source.id}
                className={active ? 'is-active' : ''}
                onClick={() => {
                  switchSource(source.id);
                  setOpen(false);
                }}
              >
                <span className="pw-source-icon"><SourceIcon id={source.id} category={source.category} /></span>
                <span className="pw-source-copy">
                  <strong>{source.name}</strong>
                  <small>{source.category === 'satellite' ? '影像' : source.category === 'topo' ? '地形' : '地图'}</small>
                </span>
                {active && <Check size={16} className="pw-source-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
