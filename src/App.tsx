import { Component } from 'react';
import { Earth, Globe, Mountain, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useUIStore } from '@stores/uiStore';
import { useMapStore } from '@stores/mapStore';
import { getEngine } from '@hooks/useMap';
import { MapView } from './components/map/MapView';
import { SourceSwitcher } from './components/controls/SourceSwitcher';
import { SearchBar } from './components/controls/SearchBar';
import { ToolSidebar } from './components/controls/ToolSidebar';
import { StatusBar } from './components/controls/StatusBar';
import { ToolPanel } from './components/panels/ToolPanel';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="pw-error-screen">
          <Earth size={30} strokeWidth={1.5} />
          <h1>地图工作区发生错误</h1>
          <pre>{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const terrain3d = useMapStore((state) => state.terrain3d);
  const toggleTerrain3d = useMapStore((state) => state.toggleTerrain3d);
  const globe = useMapStore((state) => state.globe);
  const toggleGlobe = useMapStore((state) => state.toggleGlobe);

  const handleToggleGlobe = () => {
    const nextGlobe = !globe;
    toggleGlobe();
    if (nextGlobe) {
      const engine = getEngine();
      if (engine && engine.getZoom() > 6) {
        // 放大太深时开启地球仪，平滑拉升到太空全景视角
        engine.flyTo([105, 35], 2, { duration: 1000 });
      }
    }
  };

  return (
    <ErrorBoundary>
      <main className="pw-app">
        <MapView />

        <header className="pw-topbar">
          <div className="pw-brand-block">
            <button
              type="button"
              className="pw-icon-button"
              onClick={toggleSidebar}
              title={sidebarOpen ? '收起工具栏' : '展开工具栏'}
              aria-label={sidebarOpen ? '收起工具栏' : '展开工具栏'}
            >
              {sidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
            </button>
            <div className="pw-brand-mark"><Earth size={18} strokeWidth={1.8} /></div>
            <div className="pw-brand-copy">
              <strong>PalmWorld</strong>
              <span>MAP WORKSPACE</span>
            </div>
          </div>

          <SearchBar />

          <div className="pw-topbar-actions">
            <button
              type="button"
              className={`pw-topbar-button ${globe ? 'is-active' : ''}`}
              onClick={handleToggleGlobe}
              aria-label={globe ? '切换为平面投影' : '切换为 3D 地球仪'}
              title={globe ? '切换为平面投影' : '切换为 3D 地球仪'}
            >
              <Globe size={17} />
              <span>{globe ? '地球仪' : '平面'}</span>
            </button>
            <button
              type="button"
              className={`pw-topbar-button ${terrain3d ? 'is-active' : ''}`}
              onClick={toggleTerrain3d}
              aria-label={terrain3d ? '关闭 3D 地形' : '开启 3D 地形'}
              title={terrain3d ? '关闭 3D 地形' : '开启 3D 地形'}
            >
              <Mountain size={17} />
              <span>{terrain3d ? '3D 地形' : '2D 平面'}</span>
            </button>
            <SourceSwitcher />
          </div>
        </header>

        <button
          type="button"
          className={`pw-sidebar-scrim ${sidebarOpen ? 'is-open' : ''}`}
          onClick={() => setSidebarOpen(false)}
          aria-label="关闭工具栏"
        />
        <ToolSidebar open={sidebarOpen} />
        <StatusBar />
        <ToolPanel sidebarOpen={sidebarOpen} />
      </main>
    </ErrorBoundary>
  );
}
