// components/panels/ProjectionPanel.tsx — 投影切换控制面板
// 垂直按钮组 + 正交投影下的地球旋转提示

import { useState, useEffect, useCallback } from 'react';
import { Circle, Earth, Map, MapPinned } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ProjectionType } from '@tools/projection-switch.tool';
import type { ProjectionSwitchTool } from '@tools/projection-switch.tool';
import { ProjectionView } from '@components/visual/ProjectionView';

interface ProjectionPanelProps {
  tool: ProjectionSwitchTool;
  sidebarOpen: boolean;
}

interface ProjectionInfo {
  type: ProjectionType;
  name: string;
  icon: LucideIcon;
  desc: string;
}

const PROJECTIONS: ProjectionInfo[] = [
  { type: 'mercator', name: '墨卡托', icon: Map, desc: '返回可缩放的原始 Web 地图' },
  { type: 'orthographic', name: '正交地球仪', icon: Circle, desc: '独立地球视图，可拖拽旋转' },
  { type: 'equal-earth', name: '等面积', icon: Earth, desc: '保持各区域面积比例' },
  { type: 'natural-earth', name: '自然地球', icon: MapPinned, desc: '适合世界全图展示' },
];

export function ProjectionPanel({ tool, sidebarOpen }: ProjectionPanelProps) {
  const [projection, setProjection] = useState<ProjectionType>(tool.projection);
  const [rotation, setRotation] = useState<[number, number, number]>(tool.rotation);
  const [dims, setDims] = useState({ width: 800, height: 600 });
  void sidebarOpen;

  // sync tool → UI
  useEffect(() => {
    tool.setOnStateChange(() => {
      setProjection(tool.projection);
      setRotation(tool.rotation);
    });
    return () => tool.setOnStateChange(null);
  }, [tool]);

  // measure viewport
  useEffect(() => {
    const measure = () => {
      setDims({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const handleProjectionChange = useCallback(
    (p: ProjectionType) => {
      tool.setProjection(p);
      setProjection(p);
    },
    [tool],
  );

  const handleRotationChange = useCallback(
    (r: [number, number, number]) => {
      tool.setRotation(r);
      setRotation(r);
    },
    [tool],
  );

  return (
    <>
      {/* Canvas overlay: fills entire map area */}
      <ProjectionView
        projection={projection}
        rotation={rotation}
        width={dims.width}
        height={dims.height}
        onRotationChange={handleRotationChange}
      />

      {/* Control panel */}
      <div
        className="pw-projection-toolbar"
      >
        {PROJECTIONS.map((p) => {
          const active = projection === p.type;
          const Icon = p.icon;
          return (
            <button
              type="button"
              key={p.type}
              onClick={() => handleProjectionChange(p.type as ProjectionType)}
              title={p.desc}
              className={active ? 'is-active' : ''}
            >
              <Icon size={14} />
              <span>{p.name}</span>
            </button>
          );
        })}

      </div>
    </>
  );
}
