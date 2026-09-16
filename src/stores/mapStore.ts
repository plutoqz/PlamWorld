// stores/mapStore.ts — 地图核心状态 (Zustand)

import { create } from 'zustand';
import type { LngLat } from '../core/types';
import type { ITileSource } from '../core/source';
import { sourceRegistry } from '../sources/registry';

export interface MapState {
  // 视图状态
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing: number;

  // 图源
  activeSourceId: string;
  availableSources: ITileSource[];

  // 3D 地形
  terrain3d: boolean;

  // 地球仪模式
  globe: boolean;

  // 引擎就绪
  engineReady: boolean;

  // Actions
  setView: (
    view: Partial<Pick<MapState, 'center' | 'zoom' | 'pitch' | 'bearing'>>,
  ) => void;
  switchSource: (sourceId: string) => void;
  toggleTerrain3d: () => void;
  toggleGlobe: () => void;
  setGlobe: (globe: boolean) => void;
  setEngineReady: (ready: boolean) => void;
}

export const useMapStore = create<MapState>((set) => ({
  // 默认：长沙市
  center: [112.938, 28.228],
  zoom: 12,
  pitch: 0,
  bearing: 0,

  activeSourceId: sourceRegistry.getActive().id,
  availableSources: sourceRegistry.list(),

  terrain3d: false,
  globe: false,
  engineReady: false,

  setView: (view) => set((s) => ({ ...s, ...view })),

  switchSource: (sourceId) => {
    const source = sourceRegistry.setActive(sourceId);
    if (source) {
      set({
        activeSourceId: source.id,
        availableSources: sourceRegistry.list(),
      });
    }
  },

  toggleTerrain3d: () => set((s) => ({ terrain3d: !s.terrain3d })),

  toggleGlobe: () => set((s) => ({ globe: !s.globe })),

  setGlobe: (globe) => set({ globe }),

  setEngineReady: (ready) => set({ engineReady: ready }),
}));
