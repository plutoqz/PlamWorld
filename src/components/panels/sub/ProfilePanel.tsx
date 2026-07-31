// components/panels/sub/ProfilePanel.tsx — 地形剖线面板

import { useState, useEffect } from 'react';
import { ChartLine, MousePointer2 } from 'lucide-react';
import type { ElevationProfileTool } from '@tools/elevation-profile.tool';
import { ElevationProfileChart } from '@components/terrain/ElevationProfile';
import { ClimbStatsPanel } from '@components/terrain/ClimbStats';
import type { ElevationProfile as EPData } from '@core/terrain';
import type { LngLat } from '@core/types';

interface Props {
  tool: ElevationProfileTool;
}

export function ElevationProfilePanel({ tool }: Props) {
  const [profile, setProfile] = useState<EPData | null>(null);
  const [waypoints, setWaypoints] = useState<LngLat[]>([]);
  const [sampling, setSampling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tool.setCallbacks({
      onProfileReady: (p: EPData) => setProfile(p),
      onWaypointsChange: (pts: LngLat[]) => setWaypoints([...pts]),
      onSamplingChange: (s: boolean, pct: number) => {
        setSampling(s);
        setProgress(pct);
      },
      onError: setError,
    });
  }, [tool]);

  const hint = profile
    ? `剖面完成 · ${profile.validSamples.length} 个有效高程点`
    : waypoints.length === 0
      ? '单击地图放置路径点'
      : waypoints.length === 1
        ? '继续单击添加途经点，双击或 Enter 完成'
        : sampling
          ? `正在采集 DEM 高程... ${progress}%`
          : `${waypoints.length} 个路径点 — 双击或 Enter 开始采样`;

  return (
    <div className="pw-panel-stack">
      <div className={`pw-panel-status ${sampling ? 'is-warning' : ''}`}>
        {sampling ? <ChartLine size={14} /> : <MousePointer2 size={14} />}
        <span>{hint}</span>
      </div>

      {sampling && (
        <div className="pw-progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
      )}

      {profile && !sampling && (
        <>
          <ElevationProfileChart tool={tool} profile={profile} />
          <ClimbStatsPanel profile={profile} />
        </>
      )}

      {!profile && !sampling && (
        <div className={`pw-panel-note ${error ? 'is-danger' : ''}`}>
          <MousePointer2 size={14} />
          <span>
          {error ?? (waypoints.length === 0
            ? '单击地图放置起点，继续单击添加途经点。双击地图或按 Enter 完成路径采集。'
            : '继续单击添加更多途经点，双击地图或按 Enter 开始高程采样。按 Esc 撤销上一个点。')}
          </span>
        </div>
      )}

      <div className="pw-panel-footer">
        <span>Enter 完成 · Esc 撤销 · 至少 2 个路径点</span>
      </div>
    </div>
  );
}
