// core/projection.ts — Mercator 投影变换引擎
// 纯函数，不依赖任何引擎。用于真实大小比较等跨纬度重投影。
//
// 核心原理：
//   Mercator 纬度 φ 处面积失真 ≈ 1/cos²(φ)
//   将区域 A（纬度 φ₁）拖到纬度 φ₂ 后，缩放因子 = cos(φ₁) / cos(φ₂)

import type { Feature, FeatureCollection, Polygon, MultiPolygon, Position } from 'geojson';

// ---- 类型 ----

export interface MercatorPoint {
  x: number; // 米
  y: number; // 米
}

// ---- 常量 ----

const R = 6_371_000; // 地球半径 (m)
const MAX_LAT = 85.05112877980659; // Web Mercator 上限

// ---- WGS84 ↔ Mercator ----

/** WGS84 [lng, lat] → Mercator (m) */
export function wgs84ToMercator(lngLat: [number, number]): MercatorPoint {
  const [lng, lat] = lngLat;
  const x = R * ((lng * Math.PI) / 180);
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const y = (R / 2) * Math.log((1 + sinLat) / (1 - sinLat));
  return { x, y };
}

/** Mercator (m) → WGS84 [lng, lat] */
export function mercatorToWgs84(pt: MercatorPoint): [number, number] {
  const lng = (pt.x / R) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(pt.y / R)) - Math.PI / 2) * (180 / Math.PI);
  return [lng, lat];
}

// ---- 缩放校正 ----

/**
 * 计算纬度缩放因子
 * @param fromLat 原始纬度 (deg)
 * @param toLat 目标纬度 (deg)
 * @returns 缩放因子：>1 向北变大，<1 向南变小
 */
export function mercatorScale(fromLat: number, toLat: number): number {
  const cosFrom = Math.cos((fromLat * Math.PI) / 180);
  const cosTo = Math.cos((toLat * Math.PI) / 180);
  if (cosTo < 1e-9) return cosFrom / 1e-9;
  return cosFrom / cosTo;
}

// ---- GeoJSON 投影变换 ----

/**
 * 对 GeoJSON Feature 做 Mercator 缩放 + 平移
 *
 * @param feature    原始 GeoJSON (WGS84)
 * @param fromLat    原始区域中心纬度
 * @param toLat      目标纬度
 * @param toCenter  目标中心点 (WGS84 lng, lat)
 * @returns 变换后的 GeoJSON Feature (WGS84)
 */
export function reprojectFeature(
  feature: Feature<Polygon | MultiPolygon>,
  fromLat: number,
  toLat: number,
  toCenter: [number, number],
): Feature<Polygon | MultiPolygon> {
  const scale = mercatorScale(fromLat, toLat);

  // 原始质心 (Mercator)
  const centroid = featureCentroidMercator(feature);

  // 目标质心 (Mercator)
  const targetMerc = wgs84ToMercator(toCenter);

  // 变换每个坐标点
  const transformPos = (pos: Position): Position => {
    const m = wgs84ToMercator([pos[0], pos[1]]);
    // 以质心为原点缩放
    const sx = centroid.x + (m.x - centroid.x) * scale;
    const sy = centroid.y + (m.y - centroid.y) * scale;
    // 平移到目标位置
    const dx = sx - centroid.x;
    const dy = sy - centroid.y;
    const [newLng, newLat] = mercatorToWgs84({
      x: targetMerc.x + dx,
      y: targetMerc.y + dy,
    });
    return [newLng, newLat, pos[2] ?? 0].filter((_, i) => i < 2 || pos[2] != null) as Position;
  };

  const transformRing = (ring: Position[]): Position[] =>
    ring.map(transformPos);

  if (feature.geometry.type === 'Polygon') {
    return {
      ...feature,
      geometry: {
        type: 'Polygon',
        coordinates: feature.geometry.coordinates.map(transformRing),
      },
    };
  }

  return {
    ...feature,
    geometry: {
      type: 'MultiPolygon',
      coordinates: feature.geometry.coordinates.map((poly) => poly.map(transformRing)),
    },
  };
}

/**
 * 计算 Feature 在 Mercator 投影下的质心
 */
function featureCentroidMercator(feature: Feature<Polygon | MultiPolygon>): MercatorPoint {
  // 用外环所有顶点的平均值近似质心
  const points: MercatorPoint[] = [];

  const collect = (ring: Position[]) => {
    for (const pos of ring) {
      points.push(wgs84ToMercator([pos[0], pos[1]]));
    }
  };

  if (feature.geometry.type === 'Polygon') {
    collect(feature.geometry.coordinates[0]);
  } else {
    for (const poly of feature.geometry.coordinates) {
      collect(poly[0]);
    }
  }

  if (points.length === 0) return { x: 0, y: 0 };

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  return { x: sumX / points.length, y: sumY / points.length };
}

/**
 * 估算 GeoJSON Feature 的质心纬度和中心坐标 (WGS84)
 */
export function featureLatCenter(feature: Feature<Polygon | MultiPolygon>): {
  lat: number;
  center: [number, number];
} {
  const mCentroid = featureCentroidMercator(feature);
  const center = mercatorToWgs84(mCentroid);
  return { lat: center[1], center };
}

// ---- 批量工具 ----

/**
 * 对 FeatureCollection 中的每个 Feature 重投影
 */
export function reprojectCollection(
  fc: FeatureCollection,
  fromLat: number,
  toLat: number,
  toCenter: [number, number],
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
        return reprojectFeature(
          f as Feature<Polygon | MultiPolygon>,
          fromLat,
          toLat,
          toCenter,
        );
      }
      return f;
    }),
  };
}
