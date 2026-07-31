// stores/uiStore.ts — UI 状态 (Zustand)

import { create } from 'zustand';

export interface UIState {
  // 工具
  activeToolId: string | null;

  // 面板
  searchOpen: boolean;
  sourcePanelOpen: boolean;
  sidebarOpen: boolean;

  // Actions
  setActiveTool: (toolId: string | null) => void;
  toggleSearch: () => void;
  toggleSourcePanel: () => void;
  toggleSidebar: () => void;
  setSourcePanelOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeToolId: null,
  searchOpen: false,
  sourcePanelOpen: false,
  sidebarOpen: typeof window === 'undefined' ? true : window.innerWidth >= 900,

  setActiveTool: (toolId) => set({ activeToolId: toolId }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  toggleSourcePanel: () => set((s) => ({ sourcePanelOpen: !s.sourcePanelOpen })),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSourcePanelOpen: (open) => set({ sourcePanelOpen: open }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
