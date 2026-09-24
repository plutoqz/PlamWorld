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
 * 计算单个闭合经纬度环在地球球体上的真实大地测地面积 (m²)
 * 基于球面梯形积分算法（Spherical Trapezoid Integration）
 */
function ringGeodesicAreaM2(ring: Position[]): number {
  if (ring.length < 3) return 0;
  let total = 0;
  const rad = Math.PI / 180;
  const n = ring.length;

  for (let i = 0; i < n; i++) {
    const p1 = ring[i]!;
    const p2 = ring[(i + 1) % n]!;
    const lambda1 = p1[0] * rad;
    const lambda2 = p2[0] * rad;
    const phi1 = p1[1] * rad;
    const phi2 = p2[1] * rad;

    let dLambda = lambda2 - lambda1;
    // 跨越 180° 经线时的环绕校正
    if (dLambda > Math.PI) dLambda -= 2 * Math.PI;
    if (dLambda < -Math.PI) dLambda += 2 * Math.PI;

    total += dLambda * (2 + Math.sin(phi1) + Math.sin(phi2));
  }

  return Math.abs((total * R * R) / 2);
}

/**
 * 计算 GeoJSON 多边形/多多边形在地球球面上的真实物理面积 (km²)
 */
export function calculateGeodesicAreaKm2(feature: Feature<Polygon | MultiPolygon>): number {
  let areaM2 = 0;
  const geom = feature.geometry;

  if (geom.type === 'Polygon') {
    if (geom.coordinates.length > 0) {
      areaM2 += ringGeodesicAreaM2(geom.coordinates[0]!);
      for (let j = 1; j < geom.coordinates.length; j++) {
        areaM2 -= ringGeodesicAreaM2(geom.coordinates[j]!);
      }
    }
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (poly.length > 0) {
        areaM2 += ringGeodesicAreaM2(poly[0]!);
        for (let j = 1; j < poly.length; j++) {
          areaM2 -= ringGeodesicAreaM2(poly[j]!);
        }
      }
    }
  }

  return Math.max(0, areaM2 / 1_000_000);
}

/** 格式化输出真实大地面积 */
export function formatGeodesicArea(areaKm2: number): string {
  if (areaKm2 >= 100_000) {
    return `${(areaKm2 / 10_000).toFixed(1)} 万 km²`;
  }
  return `${Math.round(areaKm2).toLocaleString()} km²`;
}

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

/** 射线法检测经纬度点是否在闭合环内 */
export function pointInRing(point: [number, number], ring: Position[]): boolean {
  const [x, y] = point;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i]![0];
    const yi = ring[i]![1];
    const xj = ring[j]![0];
    const yj = ring[j]![1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 获取 Feature 的外包矩形 [minLng, minLat, maxLng, maxLat] */
export function featureBBox(feature: Feature<Polygon | MultiPolygon>): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const check = (pos: Position) => {
    if (pos[0] < minLng) minLng = pos[0];
    if (pos[0] > maxLng) maxLng = pos[0];
    if (pos[1] < minLat) minLat = pos[1];
    if (pos[1] > maxLat) maxLat = pos[1];
  };

  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    for (const r of geom.coordinates) {
      for (const p of r) check(p);
    }
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      for (const r of poly) {
        for (const p of r) check(p);
      }
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

/** 检测经纬度点是否在 Polygon 或 MultiPolygon Feature 内部 */
export function pointInFeature(point: [number, number], feature: Feature<Polygon | MultiPolygon>): boolean {
  const bbox = featureBBox(feature);
  const [lng, lat] = point;
  // BBox 快速粗筛
  if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) {
    return false;
  }

  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    if (!geom.coordinates.length) return false;
    if (!pointInRing(point, geom.coordinates[0]!)) return false;
    // 检查孔洞
    for (let i = 1; i < geom.coordinates.length; i++) {
      if (pointInRing(point, geom.coordinates[i]!)) return false;
    }
    return true;
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (poly.length && pointInRing(point, poly[0]!)) {
        let inHole = false;
        for (let i = 1; i < poly.length; i++) {
          if (pointInRing(point, poly[i]!)) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
    return false;
  }
  return false;
}


