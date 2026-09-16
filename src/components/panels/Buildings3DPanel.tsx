// components/panels/Buildings3DPanel.tsx — 3D 建筑真实挤出控制面板
// 支持高度倍率调节、不透明度、材质风格切换与视角快捷对准

import { useState, useEffect, useCallback } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { Eye, Layers, Compass, ZoomIn } from 'lucide-react';
import type { Buildings3DTool } from '../../tools/3d-buildings.tool';
import type { BuildingTheme } from '../../engines/maplibre/building-extrusion-overlay';

interface Props {
  tool: Buildings3DTool;
}

export function Buildings3DPanel({ tool }: Props) {
  const [heightScale, setHeightScale] = useState(tool.heightScale);
  const [opacity, setOpacity] = useState(tool.opacity);
  const [theme, setTheme] = useState<BuildingTheme>(tool.theme);
  const [zoom, setZoom] = useState(15);

  useEffect(() => {
    const onStateChange = () => {
      setHeightScale(tool.heightScale);
      setOpacity(tool.opacity);
      setTheme(tool.theme);
    };
    tool.setOnStateChange(onStateChange);
    return () => tool.setOnStateChange(null);
  }, [tool]);

  useEffect(() => {
    const map = tool.engine?.getNative() as maplibregl.Map | null;
    if (!map) return;
    setZoom(map.getZoom());
    const onZoom = () => setZoom(map.getZoom());
    map.on('zoom', onZoom);
    return () => {
      map.off('zoom', onZoom);
    };
  }, [tool]);

  const handleHeightScale = useCallback(
    (scale: number) => {
      setHeightScale(scale);
      tool.setHeightScale(scale);
    },
    [tool],
  );

  const handleOpacity = useCallback(
    (op: number) => {
      setOpacity(op);
      tool.setOpacity(op);
    },
    [tool],
  );

  const handleTheme = useCallback(
    (th: BuildingTheme) => {
      setTheme(th);
      tool.setTheme(th);
    },
    [tool],
  );

  const handleSetPitch = useCallback(
    (targetPitch: number) => {
      const map = tool.engine?.getNative() as maplibregl.Map | null;
      if (map) map.easeTo({ pitch: targetPitch, duration: 600 });
    },
    [tool],
  );

  const handleZoomInToBuildings = useCallback(() => {
    const map = tool.engine?.getNative() as maplibregl.Map | null;
    if (map) map.easeTo({ zoom: 15.5, pitch: 60, duration: 800 });
  }, [tool]);

  return (
    <div className="pw-panel-stack" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 缩放层级提示 */}
      {zoom < 14 && (
        <div
          style={{
            background: 'rgba(234, 179, 8, 0.12)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 11,
            color: '#facc15',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ZoomIn size={14} />
            <span>当前缩放等级 ({zoom.toFixed(1)}) 较小，建筑挤出将在 Zoom 14+ 呈现</span>
          </div>
          <button
            type="button"
            className="pw-secondary-button"
            onClick={handleZoomInToBuildings}
            style={{ fontSize: 11, alignSelf: 'flex-start', padding: '3px 8px' }}
          >
            聚焦到楼宇视角 (Zoom 15.5)
          </button>
        </div>
      )}

      {/* 高度倍率 */}
      <div className="pw-control-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Layers size={13} />
          <span>建筑高度倍率</span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={0.5}
            max={3.0}
            step={0.25}
            value={heightScale}
            onChange={(e) => handleHeightScale(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <output style={{ minWidth: 36, textAlign: 'right', fontWeight: 600 }}>
            {heightScale.toFixed(2)}x
          </output>
        </div>
      </div>

      {/* 不透明度 */}
      <div className="pw-control-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Eye size={13} />
          <span>材质透明度</span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={0.3}
            max={1.0}
            step={0.05}
            value={opacity}
            onChange={(e) => handleOpacity(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <output style={{ minWidth: 36, textAlign: 'right', fontWeight: 600 }}>
            {Math.round(opacity * 100)}%
          </output>
        </div>
      </div>

      {/* 配色风格 */}
      <div className="pw-control-row">
        <label>着色材质风格</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 4 }}>
          {(
            [
              { id: 'modern', label: '城市蓝调', color: '#3b82f6' },
              { id: 'cyberpunk', label: '赛博霓虹', color: '#ec4899' },
              { id: 'white', label: '纯白素雅', color: '#cbd5e1' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTheme(item.id)}
              className="pw-secondary-button"
              style={{
                padding: '6px 4px',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                borderColor: theme === item.id ? item.color : undefined,
                background: theme === item.id ? 'rgba(255,255,255,0.08)' : undefined,
                color: theme === item.id ? '#fff' : 'var(--pw-text-muted)',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: item.color,
                }}
              />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 视角快速倾斜 */}
      <div className="pw-control-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Compass size={13} />
          <span>视角快速倾斜</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 4 }}>
          <button
            type="button"
            className="pw-secondary-button"
            onClick={() => handleSetPitch(60)}
            style={{ fontSize: 11, padding: '5px' }}
          >
            60° 鸟瞰
          </button>
          <button
            type="button"
            className="pw-secondary-button"
            onClick={() => handleSetPitch(40)}
            style={{ fontSize: 11, padding: '5px' }}
          >
            40° 斜视
          </button>
          <button
            type="button"
            className="pw-secondary-button"
            onClick={() => handleSetPitch(0)}
            style={{ fontSize: 11, padding: '5px' }}
          >
            0° 平面
          </button>
        </div>
      </div>

      <div
        style={{
          fontSize: 10,
          color: 'var(--pw-text-faint)',
          lineHeight: 1.4,
          paddingTop: 6,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        ℹ️ 基于 OpenFreeMap 全球矢量建筑物瓦片（OpenMapTiles 规范），按真实层高/楼高自动挤出。
      </div>
    </div>
  );
}
