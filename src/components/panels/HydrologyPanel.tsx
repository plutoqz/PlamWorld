// components/panels/HydrologyPanel.tsx — 水文分析控制面板 v0.5

import { useState, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { HydrologyTool, HydrologyMode } from '@tools/hydrology.tool';
import type { HydrologyResult } from '@workers/worker-bridge';
import { useHydrologyRenderer } from '@components/terrain/HydrologyLayer';
import type { LngLat } from '@core/types';

interface Props {
  tool: HydrologyTool;
}

export function HydrologyPanel({ tool }: Props) {
  const [mode, setMode] = useState<HydrologyMode>(tool.mode);
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<{ sinkCount: number; maxFlowAcc: number } | null>(null);
  const [pourPoint, setPourPoint] = useState<{ col: number; row: number; lngLat: LngLat } | null>(null);
  const [watershedArea, setWatershedArea] = useState<number | null>(null);

  const { setMap, renderFlowAcc, renderTWI, renderWatershed, clearAll } = useHydrologyRenderer();
  const demParamsRef = useRef<{
    cols: number;
    rows: number;
    cellSize: number;
    bounds: { west: number; south: number; east: number; north: number };
  } | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const clickHandlerRef = useRef<((e: maplibregl.MapMouseEvent) => void) | null>(null);

  // 初始化引擎引用
  useEffect(() => {
    const engine = (tool as any).ctx?.engine;
    if (!engine) return;

    const map = engine.getNative() as maplibregl.Map;
    mapRef.current = map;
    setMap(map);

    return () => {
      clearAll();
      if (clickHandlerRef.current) {
        map.off('click', clickHandlerRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 注册回调
  useEffect(() => {
    tool.setCallbacks({
      onProgress: (msg, pct) => {
        setStatus(msg);
        setProgress(pct);
      },
      onResult: (result: HydrologyResult) => {
        setStats({ sinkCount: result.sinkCount, maxFlowAcc: result.maxFlowAcc });
        setStatus('分析完成');

        if (mode === 'flow-accumulation' && demParamsRef.current) {
          renderFlowAcc(result.flowAcc, demParamsRef.current);
        }
      },
      onWatershed: (result) => {
        setStats({ sinkCount: result.sinkCount, maxFlowAcc: result.maxFlowAcc });
        setWatershedArea(result.watershed.filter((v) => v === 1).length);
        setStatus('流域划分完成');

        if (demParamsRef.current) {
          renderWatershed(result.watershed, demParamsRef.current);
        }
      },
      onTWI: (result) => {
        setStats({ sinkCount: result.sinkCount, maxFlowAcc: result.maxFlowAcc });
        setStatus('TWI 计算完成');

        if (demParamsRef.current) {
          renderTWI(result.twi, demParamsRef.current);
        }
      },
      onDEMReady: (params) => {
        demParamsRef.current = {
          cols: params.cols,
          rows: params.rows,
          cellSize: params.cellSize,
          bounds: params.bounds,
        };
      },
      onPourPoint: (col, row, lngLat) => {
        setPourPoint({ col, row, lngLat });
      },
    });

    return () => tool.setCallbacks(null);
  }, [tool, mode, renderFlowAcc, renderTWI, renderWatershed]); // eslint-disable-line react-hooks/exhaustive-deps

  // 模式切换时同步
  useEffect(() => {
    if (tool.mode !== mode) {
      tool.setMode(mode);
    }

    // 模式切换到 watershed 时启用点击选点
    if (mode === 'watershed' && mapRef.current) {
      enablePourPointSelection();
    } else {
      disablePourPointSelection();
    }

    return () => disablePourPointSelection();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const enablePourPointSelection = () => {
    const map = mapRef.current;
    if (!map) return;
    disablePourPointSelection();

    const handler = (e: maplibregl.MapMouseEvent) => {
      if (!demParamsRef.current) return;
      const { lng, lat } = e.lngLat;
      const { bounds: { west, south, east, north }, cols, rows } = demParamsRef.current;

      const col = Math.round(((lng - west) / (east - west)) * (cols - 1));
      const row = Math.round(((north - lat) / (north - south)) * (rows - 1));

      tool.selectPourPoint(col, row, [lng, lat]);
    };

    clickHandlerRef.current = handler;
    map.on('click', handler);
  };

  const disablePourPointSelection = () => {
    if (mapRef.current && clickHandlerRef.current) {
      mapRef.current.off('click', clickHandlerRef.current);
      clickHandlerRef.current = null;
    }
  };

  const handleAnalyze = () => {
    setStats(null);
    setPourPoint(null);
    setWatershedArea(null);
    clearAll();
    tool.analyzeRegion();
  };

  const handleModeChange = (newMode: HydrologyMode) => {
    setMode(newMode);
    clearAll();
    setStats(null);
    setPourPoint(null);
    setWatershedArea(null);

    // Re-trigger analysis for the new mode
    if (demParamsRef.current) {
      setTimeout(() => {
        if (newMode === 'flow-accumulation') {
          tool.setMode(newMode);
          tool.analyzeRegion();
        } else if (newMode === 'twi') {
          tool.setMode(newMode);
          tool.analyzeRegion();
        } else if (newMode === 'watershed') {
          // Don't auto-analyze, wait for pour point click
          tool.setMode(newMode);
          setStatus('💡 点击地图选择流域出口（倾泻点）');
        }
      }, 100);
    }
  };

  const modes: { mode: HydrologyMode; label: string; icon: string }[] = [
    { mode: 'flow-accumulation', label: '流量累积', icon: '🌊' },
    { mode: 'watershed', label: '流域划分', icon: '🏞️' },
    { mode: 'twi', label: 'TWI 湿度', icon: '💧' },
  ];

  return (
    <div style={{
      position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
      zIndex: 2000, minWidth: 380,
      background: 'rgba(10,10,20,0.9)', backdropFilter: 'blur(16px)',
      borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)',
      padding: '12px 20px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
          💧 水文分析
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
          D8 算法 · DEM 格网
        </span>
      </div>

      {/* 分析按钮 */}
      <button
        onClick={handleAnalyze}
        disabled={status.includes('查询') || status.includes('计算')}
        style={{
          width: '100%', padding: '8px 0', border: 'none', borderRadius: 8,
          cursor: status.includes('查询') ? 'wait' : 'pointer',
          fontSize: 13, fontWeight: 600,
          background: 'rgba(33,150,243,0.15)',
          color: '#42A5F5',
          transition: 'all 0.15s',
          opacity: status.includes('查询') ? 0.6 : 1,
        }}
      >
        🔍 分析当前视口范围
      </button>

      {/* 进度 */}
      {status && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11,
            color: progress === 100 ? '#66bb6a' : status.includes('错误') ? '#ef5350' : '#ffab40',
          }}>
            {status}
          </span>
          {progress > 0 && progress < 100 && (
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progress}%`,
                background: 'linear-gradient(90deg, #42A5F5, #2196F3)',
                borderRadius: 2, transition: 'width 0.3s',
              }} />
            </div>
          )}
        </div>
      )}

      {/* 模式切换 */}
      <div style={{ display: 'flex', gap: 4 }}>
        {modes.map((m) => (
          <button
            key={m.mode}
            onClick={() => handleModeChange(m.mode)}
            style={{
              flex: 1, padding: '6px 0', border: 'none', borderRadius: 6,
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: mode === m.mode ? 'rgba(33,150,243,0.18)' : 'rgba(255,255,255,0.05)',
              color: mode === m.mode ? '#42A5F5' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.15s',
            }}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* 统计信息 */}
      {stats && (
        <div style={{
          display: 'flex', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.6)',
          borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8,
        }}>
          <span>🌊 洼地: <b style={{ color: '#ffa726' }}>{stats.sinkCount}</b></span>
          <span>📊 最大累积: <b style={{ color: '#42A5F5' }}>{stats.maxFlowAcc.toFixed(0)}</b></span>
          {watershedArea !== null && (
            <span>🏞️ 流域面积: <b style={{ color: '#66bb6a' }}>{watershedArea} 格网</b></span>
          )}
        </div>
      )}

      {/* 倾泻点信息 */}
      {pourPoint && mode === 'watershed' && (
        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.5)',
          borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6,
        }}>
          📍 倾泻点: ({pourPoint.col}, {pourPoint.row}){' '}
          [{pourPoint.lngLat[0].toFixed(4)}, {pourPoint.lngLat[1].toFixed(4)}]
        </div>
      )}

      {/* 图例 */}
      {stats && status.includes('完成') && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
          color: 'rgba(255,255,255,0.3)',
          borderTop: mode !== 'watershed' ? '1px solid rgba(255,255,255,0.05)' : 'none',
          paddingTop: mode !== 'watershed' ? 6 : 0,
        }}>
          {mode === 'flow-accumulation' && (
            <>
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#1E40AF' }} />
              低
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#0EA5E9' }} />
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#67E8F9' }} />
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#FFFFFF' }} />
              高 (log scale)
            </>
          )}
          {mode === 'twi' && (
            <>
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#8B6914' }} />
              干燥
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#A0C030' }} />
              <span style={{ width: 14, height: 8, borderRadius: 2, background: '#1A6B3C' }} />
              湿润
            </>
          )}
          {mode === 'watershed' && (
            <span>🔵 蓝色填充 = 流域范围  ·  蓝色边线 = 流域边界</span>
          )}
        </div>
      )}
    </div>
  );
}
