// core/geocode.ts — 地理编码工具函数
// Nominatim / Overpass API 封装，纯函数，无 DOM 依赖

import type { LngLat } from './types';

// ---- Nominatim 逆地理编码 ----

export interface PlaceInfo {
  displayName: string;
  address: Record<string, string>;
  category: string;
  type: string;
  osmId: number;
  lngLat: LngLat;
}

export async function reverseGeocode(
  lngLat: LngLat,
  signal?: AbortSignal,
): Promise<PlaceInfo | null> {
  const [lng, lat] = lngLat;
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&extratags=1`;
  try {
    const resp = await fetch(url, { signal });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || data.error) return null;

    return {
      displayName: data.display_name ?? '',
      address: data.address ?? {},
      category: data.category ?? '',
      type: data.type ?? '',
      osmId: data.osm_id ?? 0,
      lngLat,
    };
  } catch {
    return null;
  }
}

// ---- Nominatim 正向搜索 ----

export interface SearchResult {
  displayName: string;
  lngLat: LngLat;
  category: string;
  type: string;
  importance: number;
}

export async function searchPlaces(
  query: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=${limit}&addressdetails=1`;
  try {
    const resp = await fetch(url, { signal });
    if (!resp.ok) return [];
    const results: any[] = await resp.json();
    return results.map((r) => ({
      displayName: r.display_name ?? '',
      lngLat: [parseFloat(r.lon), parseFloat(r.lat)] as LngLat,
      category: r.category ?? '',
      type: r.type ?? '',
      importance: r.importance ?? 0,
    }));
  } catch {
    return [];
  }
}

// ---- Overpass API 周边 POI 查询 ----

export interface NearbyPOI {
  name: string;
  category: string;
  type: string;
  lngLat: LngLat;
  distance: number; // meters
  tags?: Record<string, string>;
}

/** 定义要查询的 POI 类别 */
export const POI_CATEGORIES = {
  transport: {
    name: '交通',
    query: 'node["highway"="bus_stop"](around:RADIUS,LAT,LNG);node["railway"="station"](around:RADIUS,LAT,LNG);node["railway"="subway_entrance"](around:RADIUS,LAT,LNG);node["aeroway"="aerodrome"](around:RADIUS,LAT,LNG);',
  },
  food: {
    name: '餐饮',
    query: 'node["amenity"~"restaurant|cafe|fast_food|pub|bar"](around:RADIUS,LAT,LNG);',
  },
  shopping: {
    name: '购物',
    query: 'node["shop"~"supermarket|mall|convenience|department_store"](around:RADIUS,LAT,LNG);',
  },
  leisure: {
    name: '休闲',
    query: 'node["leisure"~"park|playground|sports_centre|garden"](around:RADIUS,LAT,LNG);node["tourism"~"attraction|museum|viewpoint"](around:RADIUS,LAT,LNG);',
  },
  education: {
    name: '教育',
    query: 'node["amenity"~"school|university|library|college"](around:RADIUS,LAT,LNG);',
  },
  health: {
    name: '医疗',
    query: 'node["amenity"~"hospital|clinic|pharmacy|doctors"](around:RADIUS,LAT,LNG);',
  },
};

export async function queryNearbyPOIs(
  lngLat: LngLat,
  radiusMeters = 500,
  categories: (keyof typeof POI_CATEGORIES)[] = ['transport', 'food', 'leisure'],
  signal?: AbortSignal,
): Promise<NearbyPOI[]> {
  const [lng, lat] = lngLat;

  // Build Overpass query for selected categories
  const queries = categories.map((cat) =>
    POI_CATEGORIES[cat].query
      .replace(/RADIUS/g, String(radiusMeters))
      .replace(/LAT/g, lat.toFixed(6))
      .replace(/LNG/g, lng.toFixed(6)),
  );
  const fullQuery = `[out:json][timeout:5];(${queries.join('')});out body 50;`;

  try {
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: fullQuery,
      signal,
    });
    if (!resp.ok) return [];
    const data = await resp.json();

    return (data.elements ?? [])
      .filter((el: any) => el.type === 'node' && el.tags?.name)
      .map((el: any) => ({
        name: el.tags.name,
        category: el.tags.amenity ?? el.tags.leisure ?? el.tags.shop ?? el.tags.highway ?? el.tags.railway ?? 'other',
        type: el.tags.amenity
          ? 'amenity'
          : el.tags.leisure
            ? 'leisure'
            : el.tags.shop
              ? 'shop'
              : el.tags.highway
                ? 'transport'
                : el.tags.railway
                  ? 'transport'
                  : 'other',
        lngLat: [el.lon, el.lat] as LngLat,
        distance: haversineDistanceMeters([lng, lat], [el.lon, el.lat]),
        tags: el.tags,
      }))
      .sort((a: NearbyPOI, b: NearbyPOI) => a.distance - b.distance)
      .slice(0, 30);
  } catch {
    return [];
  }
}

// ---- 地点摘要生成 ----

export function generatePlaceSummary(
  place: PlaceInfo,
  pois: NearbyPOI[],
  radius: number,
): string {
  const addr = place.address;
  const parts: string[] = [];

  // 地址描述
  const localityParts: string[] = [];
  if (addr.city || addr.town || addr.village) {
    localityParts.push(addr.city ?? addr.town ?? addr.village ?? '');
  }
  if (addr.state || addr.province) {
    localityParts.push(addr.state ?? addr.province ?? '');
  }
  if (addr.country) localityParts.push(addr.country);
  if (localityParts.length > 0) {
    parts.push(`📍 位于${localityParts.join('，')}`);
  }

  // 地点类型
  const typeMap: Record<string, string> = {
    amenity: '公共服务设施',
    highway: '道路',
    building: '建筑物',
    leisure: '休闲场所',
    tourism: '旅游景点',
    natural: '自然地貌',
    waterway: '水道',
    railway: '铁路',
    place: '地点',
  };
  const typeLabel = typeMap[place.category] ?? place.category;
  if (place.type) {
    parts.push(`🏷️ 类型：${typeLabel} / ${place.type}`);
  }

  // POI 统计
  if (pois.length > 0) {
    const byCategory = new Map<string, NearbyPOI[]>();
    for (const poi of pois) {
      const existing = byCategory.get(poi.type) ?? [];
      existing.push(poi);
      byCategory.set(poi.type, existing);
    }

    parts.push(`📊 周边 ${radius}m 内共有 ${pois.length} 个兴趣点：`);
    for (const [cat, items] of byCategory) {
      const top3 = items
        .slice(0, 3)
        .map((p) => `${p.name}(${Math.round(p.distance)}m)`)
        .join('、');
      const label =
        cat === 'amenity'
          ? '设施'
          : cat === 'transport'
            ? '交通'
            : cat === 'leisure'
              ? '休闲'
              : cat === 'shop'
                ? '购物'
                : cat;
      parts.push(`  · ${label}：${top3}${items.length > 3 ? ` 等${items.length}个` : ''}`);
    }
  } else {
    parts.push(`📊 周边 ${radius}m 内未发现兴趣点`);
  }

  return parts.join('\n');
}

// ---- Haversine 距离 ----

function haversineDistanceMeters(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aVal =
    sinDLat * sinDLat +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}
