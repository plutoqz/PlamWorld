// components/compare/CompareView.tsx — 图源对比视图
//
// 架构：保持主地图不动，在其上方叠加第二地图引擎
//   split 模式 — 右侧容器覆盖右半屏，内含第二地图
//   swipe 模式 — 全屏覆盖，clip-path 揭示右侧，拖拽手柄控制分界
//
// 视角同步：监听两侧 moveend，用防抖标志防止反馈循环

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import { Check, Columns2, GripVertical, SplitSquareHorizontal } from 'lucide-react';
import { MapLibreAdapter } from '../../engines/maplibre/adapter';
import { sourceRegistry } from '../../sources/registry';
import { getEngine } from '../../hooks/useMap';
import { useMapStore } from '../../stores/mapStore';
import type { CompareTool, CompareMode } from '../../tools/compare.tool';

interface CompareViewProps {
  tool: CompareTool;
}

/** 分隔条拖动时两侧比例 */
const INITIAL_SPLIT = 50; // 百分比：左侧占 50%

export function CompareView({ tool }: CompareViewProps) {
  // ---- state ----
  const [mode, setModeState] = useState<CompareMode>(tool.mode);
  const [leftSourceId, setLeftSourceId] = useState(tool.leftSource);
  const [rightSourceId, setRightSourceId] = useState(tool.rightSource);
  const [splitPct, setSplitPct] = useState(INITIAL_SPLIT);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);

  // ---- refs ----
  const containerRef = useRef<HTMLDivElement>(null);
  const rightMapContainerRef = useRef<HTMLDivElement>(null);
  const rightEngineRef = useRef<MapLibreAdapter | null>(null);
  const syncingRef = useRef(false); // 防反馈循环
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // ---- 注册 tool 回调 ----
  useEffect(() => {
    const onStateChange = () => {
      setModeState(tool.mode);
      setLeftSourceId(tool.leftSource);
      setRightSourceId(tool.rightSource);
    };
    tool.setOnStateChange(onStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool]);

  // ---- 第二地图引擎生命周期 ----
  useEffect(() => {
    if (!rightMapContainerRef.current) return;

    const rightEngine = new MapLibreAdapter();
    rightEngineRef.current = rightEngine;

    const mainEngine = getEngine();
    const mainMap = mainEngine?.getNative() as maplibregl.Map | null;
    const storeState = useMapStore.getState();

    // 用右侧图源挂载
    const rightSource = sourceRegistry.get(rightSourceId) ?? sourceRegistry.getActive();
    rightEngine.mount({
      container: rightMapContainerRef.current,
      center: storeState.center,
      zoom: storeState.zoom,
      pitch: storeState.pitch,
      bearing: storeState.bearing,
      attributionControl: false,
      style: rightSource.toEngineConfig('maplibre'),
    });

    // 等右侧 map ready
    const onRightLoad = () => {
      setReady(true);
      // 初次同步
      if (mainMap) {
        const c = mainMap.getCenter();
        const z = mainMap.getZoom();
        syncToRight(rightEngine, [c.lng, c.lat], z);
      }
    };
    rightEngine.on('load', onRightLoad);

    // ---- 视角同步逻辑 ----
    // 主地图 move → 同步到右侧
    const onMainMove = () => {
      if (syncingRef.current || !mainMap) return;
      syncingRef.current = true;
      const c = mainMap.getCenter();
      syncToRight(rightEngine, [c.lng, c.lat], mainMap.getZoom());
      syncingRef.current = false;
    };
    mainMap?.on('move', onMainMove);

    // 右侧地图 move → 同步回主地图
    const onRightMove = () => {
      if (syncingRef.current) return;
      const rMap = rightEngine.getNative() as maplibregl.Map | null;
      if (!rMap || !mainMap) return;
      syncingRef.current = true;
      const c = rMap.getCenter();
      mainMap.setCenter([c.lng, c.lat]);
      mainMap.setZoom(rMap.getZoom());
      syncingRef.current = false;
    };
    rightEngine.on('move', onRightMove);

    return () => {
      mainMap?.off('move', onMainMove);
      rightEngine.off('move', onRightMove);
      rightEngine.off('load', onRightLoad);
      rightEngine.destroy();
      rightEngineRef.current = null;
      setReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 右侧图源切换 ----
  const switchRightSource = useCallback(
    (sourceId: string) => {
      const rightEngine = rightEngineRef.current;
      if (!rightEngine) return;
      const source = sourceRegistry.get(sourceId);
      if (!source) return;
      rightEngine.setTileSource(source);
      tool.setRightSource(sourceId);
      setRightSourceId(sourceId);
    },
    [tool],
  );

  // ---- 左侧图源切换（直接切主地图） ----
  const switchLeftSource = useCallback(
    (sourceId: string) => {
      const mainEngine = getEngine();
      if (!mainEngine) return;
      const source = sourceRegistry.get(sourceId);
      if (!source) return;
      mainEngine.setTileSource(source);
      useMapStore.getState().switchSource(sourceId);
      tool.setLeftSource(sourceId);
      setLeftSourceId(sourceId);
    },
    [tool],
  );

  // ---- 模式切换 ----
  const switchMode = useCallback(
    (m: CompareMode) => {
      tool.setMode(m);
      setModeState(m);
      setSplitPct(INITIAL_SPLIT);
    },
    [tool],
  );

  // ---- 分隔条拖动 ----
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.max(15, Math.min(85, pct)));
    };
    const onUp = () => {
      setDragging(false);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }, []);

  // ---- 图源列表 ----
  const sources = useMemo(() => sourceRegistry.list(), []);

  // ---- 计算右侧容器样式 ----
  const rightContainerStyle = useMemo((): React.CSSProperties => {
    if (mode === 'split') {
      return {
        position: 'absolute',
        left: `${splitPct}%`,
        top: 0,
        right: 0,
        bottom: 0,
        background: '#0a0a0f',
        overflow: 'hidden',
      };
    }
    // swipe: 全屏覆盖，clip-path 只露出右侧
    return {
      position: 'absolute',
      inset: 0,
      clipPath: `inset(0 0 0 ${splitPct}%)`,
      overflow: 'hidden',
    };
  }, [mode, splitPct]);

  // ---- 源选择器渲染 ----
  const sourceOptions = sources.map((s) => (
    <option key={s.id} value={s.id}>
      {s.name}
    </option>
  ));

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1200,
        pointerEvents: 'none', // 让点击穿透到地图，控制栏除外
      }}
    >
      {/* ===== 第二地图容器 ===== */}
      <div style={{ ...rightContainerStyle, pointerEvents: 'auto' }}>
        <div ref={rightMapContainerRef} style={{ position: 'absolute', inset: 0 }} />
      </div>

      <div className="pw-compare-toolbar">
        <div className="pw-compare-modes">
          {(['split', 'swipe'] as CompareMode[]).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => switchMode(m)}
              className={mode === m ? 'is-active' : ''}
            >
              {m === 'split' ? <Columns2 size={14} /> : <SplitSquareHorizontal size={14} />}
              {m === 'split' ? '分屏' : '滑动帘'}
            </button>
          ))}
        </div>

        <select
          aria-label="左侧图源"
          value={leftSourceId}
          onChange={(e) => switchLeftSource(e.target.value)}
        >
          {sourceOptions}
        </select>

        <span className="pw-compare-vs">vs</span>

        <select
          aria-label="右侧图源"
          value={rightSourceId}
          onChange={(e) => switchRightSource(e.target.value)}
        >
          {sourceOptions}
        </select>

        <span
          className={`pw-ready-indicator ${ready ? 'is-ready' : ''}`}
          title={ready ? '图源已就绪' : '图源加载中'}
        >
          {ready ? <Check size={14} /> : '...'}
        </span>
      </div>

      <div
        onPointerDown={handlePointerDown}
        className={`pw-compare-divider ${dragging ? 'is-dragging' : ''}`}
        style={{
          left: `${splitPct}%`,
          transform: 'translateX(-50%)',
        }}
      >
        <div className="pw-compare-divider-handle">
          {mode === 'swipe' ? <SplitSquareHorizontal size={17} /> : <GripVertical size={17} />}
        </div>
      </div>
    </div>
  );
}

// ---- helpers ----

function syncToRight(rightEngine: MapLibreAdapter, center: [number, number], zoom: number): void {
  const rMap = rightEngine.getNative() as maplibregl.Map | null;
  if (!rMap) return;
  // 用 jumpTo 避免动画堆积
  rMap.jumpTo({ center, zoom });
}
