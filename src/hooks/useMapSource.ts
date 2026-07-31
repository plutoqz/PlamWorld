// hooks/useMapSource.ts — 图源切换 Hook
// 封装图源切换逻辑，引擎切换 + store 同步一步完成

import { useCallback } from 'react';
import { useMapStore } from '../stores/mapStore';
import { sourceRegistry } from '../sources/registry';
import { getEngine } from './useMap';
import type { ITileSource } from '../core/source';

export interface UseMapSourceReturn {
  /** 当前活动图源 */
  activeSource: ITileSource | undefined;
  /** 所有可用图源 */
  sources: ITileSource[];
  /** 切换图源 (传 id 或 category) */
  switchSource: (sourceId: string) => void;
  /** 是否当前活动图源 */
  isActive: (sourceId: string) => boolean;
  /** 按分类过滤 */
  getByCategory: (category: string) => ITileSource[];
}

/**
 * useMapSource — 图源切换 Hook
 *
 * @example
 * const { activeSource, sources, switchSource } = useMapSource();
 * // sources.map(s => <button onClick={() => switchSource(s.id)}>{s.name}</button>)
 */
export function useMapSource(): UseMapSourceReturn {
  const activeSourceId = useMapStore((s) => s.activeSourceId);

  const switchSource = useCallback((sourceId: string) => {
    const source = sourceRegistry.get(sourceId);
    if (!source || source.id === activeSourceId) return;

    const engine = getEngine();
    engine?.setTileSource(source);
    useMapStore.getState().switchSource(source.id);
  }, [activeSourceId]);

  const isActive = useCallback(
    (sourceId: string) => sourceId === activeSourceId,
    [activeSourceId],
  );

  const getByCategory = useCallback(
    (category: string) => sourceRegistry.listByCategory(category),
    [],
  );

  return {
    activeSource: sourceRegistry.get(activeSourceId),
    sources: sourceRegistry.list(),
    switchSource,
    isActive,
    getByCategory,
  };
}
