// hooks/useMap.ts — 地图实例生命周期 Hook
// 封装 MapLibreAdapter 的创建、挂载、事件同步、销毁全流程

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Protocol } from 'pmtiles';
import { MapLibreAdapter } from '../engines/maplibre/adapter';
import { sourceRegistry } from '../sources/registry';
import { useMapStore } from '../stores/mapStore';
import type { IMapEngine } from '../core/engine';

// Vite 会预打包 MapLibre 主模块，但不会自动复制它按相对路径查找的 Worker。
// 显式 URL 导入可同时保证开发服务器和静态构建产物中的 GeoJSON Worker 可用。
maplibregl.setWorkerUrl(maplibreWorkerUrl);

// 注册 PMTiles 协议（全局单次）
let pmtilesRegistered = false;
function ensurePMTilesProtocol() {
  if (pmtilesRegistered) return;
  const protocol = new Protocol({ metadata: true });
  maplibregl.addProtocol('pmtiles', protocol.tile);
  pmtilesRegistered = true;
}

/** 获取当前引擎实例（供其他 hook/工具使用） */
export function getEngine(): IMapEngine | null {
  return ((window as any).__engine as IMapEngine) ?? null;
}

/** 设置引擎实例并同步到 window.__engine */
function setEngine(engine: IMapEngine | null): void {
  if (engine) {
    (window as any).__engine = engine;
  } else {
    delete (window as any).__engine;
  }
}

/**
 * useMap — 地图生命周期 Hook
 * 返回 containerRef，挂到 div 上即可
 *
 * @example
 * function MapView() {
 *   const containerRef = useMap();
 *   return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
 * }
 */
export function useMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapLibreAdapter | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;
    useMapStore.getState().setEngineReady(false);

    ensurePMTilesProtocol();

    const engine = new MapLibreAdapter();
    engineRef.current = engine;
    setEngine(engine);

    const activeSource = sourceRegistry.getActive();

    engine.mount({
      container: containerRef.current,
      center: useMapStore.getState().center,
      zoom: useMapStore.getState().zoom,
      style: activeSource.toEngineConfig('maplibre'),
    });

    // style.load 不依赖瓦片网络，作为交互就绪信号。
    const markReady = () => {
      useMapStore.getState().setEngineReady(true);
    };
    engine.on('style.load', markReady);
    engine.on('load', markReady);

    // idle 兜底（load 可能不触发）
    engine.on('idle', () => {
      if (!useMapStore.getState().engineReady) {
        useMapStore.getState().setEngineReady(true);
      }
    });

    // moveend → 同步视图状态到 store
    engine.on('moveend', () => {
      useMapStore.getState().setView({
        center: engine.getCenter(),
        zoom: engine.getZoom(),
      });
    });

    return () => {
      engine.off('style.load', markReady);
      engine.off('load', markReady);
      engine.destroy();
      engineRef.current = null;
      setEngine(null);
      useMapStore.getState().setEngineReady(false);
      initializedRef.current = false;
    };
  }, []);

  return containerRef;
}
