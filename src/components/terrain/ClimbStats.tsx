// components/terrain/ClimbStats.tsx — 爬升/下降统计卡片
//
// 从 ElevationProfile 计算爬升统计并展示（PROJECT_PLAN 11.6）

import type { ElevationProfile, ClimbStats as CSData } from '../../core/terrain';
import { computeClimbStats } from '../../core/terrain';

interface ClimbStatsProps {
  profile: ElevationProfile;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  '平缓': '#66bb6a',
  '中等': '#ffa726',
  '挑战': '#ef5350',
  '极限': '#e91e63',
};

export function ClimbStatsPanel({ profile }: ClimbStatsProps) {
  const stats: CSData = computeClimbStats(profile);

  const items = [
    { label: '总距离', value: `${stats.totalDistanceKm} km` },
    { label: '总爬升', value: `↑ ${stats.totalClimb} m`, color: '#ef5350' },
    { label: '总下降', value: `↓ ${stats.totalDescent} m`, color: '#42a5f5' },
    { label: '净变化', value: `${stats.netChange >= 0 ? '+' : ''}${stats.netChange} m` },
    { label: '最高点', value: `${stats.maxElevation} m` },
    { label: '最低点', value: `${stats.minElevation} m` },
    { label: '最大坡度', value: `${stats.maxSlopeDeg}°` },
    { label: '平均坡度', value: `${stats.avgSlopePercent}%` },
  ];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 16px',
      background: 'rgba(10,10,20,0.85)', backdropFilter: 'blur(12px)',
      borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 4,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
          ⛰️ 爬升分析
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 10,
          color: '#fff',
          background: DIFFICULTY_COLORS[stats.difficulty] || '#666',
        }}>
          {stats.difficulty}
        </span>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px',
      }}>
        {items.map((item) => (
          <div key={item.label} style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 12,
          }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>{item.label}</span>
            <span style={{
              color: (item as any).color || 'rgba(255,255,255,0.8)',
              fontWeight: 600, fontFamily: 'monospace',
            }}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
