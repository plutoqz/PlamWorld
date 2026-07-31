import { Component } from 'react';
import { Earth, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useUIStore } from '@stores/uiStore';
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
