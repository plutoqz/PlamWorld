// tools/geoguessr.tool.ts — GeoGuessr 趣味模式工具 (MapTool)
//
// 随机投放地点 → 用户拖动地图探索 → 在 minimap 上点击猜测 → 计分
// 验证工具系统的灵活性：纯 MapTool 插件实现

import type { MapTool, ToolContext } from '../core/tools';
import type { LngLat } from '../core/types';

export interface GeoGuessrLocation {
  lng: number;
  lat: number;
  name: string;
  hint: string;
  category: 'global' | 'china' | 'europe' | 'nature';
}

export interface GeoGuessrRound {
  location: GeoGuessrLocation;
  guess: LngLat | null;
  score: number; // 0-5000
  distance: number; // meters
}

export class GeoGuessrTool implements MapTool {
  readonly id = 'geoguessr';
  readonly name = 'GeoGuessr 趣味模式';
  readonly icon = '🎯';
  readonly category = 'comparison';
  readonly description = '随机投放 → 探索地图 → 猜位置 → 计分';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private _rounds: GeoGuessrRound[] = [];
  private _currentRound = 0;
  private _totalRounds = 5;
  private _phase: 'exploring' | 'guessing' | 'result' | 'idle' = 'idle';
  private _gameCategory: GeoGuessrLocation['category'] = 'global';
  private onStateChange: (() => void) | null = null;

  // ---- built-in location pool (~120 locations) ----
  private static LOCATIONS: GeoGuessrLocation[] = [
    // Global landmarks
    { lng: -0.1276, lat: 51.5074, name: '伦敦', hint: '欧洲', category: 'global' },
    { lng: 2.3522, lat: 48.8566, name: '巴黎', hint: '欧洲', category: 'global' },
    { lng: -74.0060, lat: 40.7128, name: '纽约', hint: '北美', category: 'global' },
    { lng: 139.6503, lat: 35.6762, name: '东京', hint: '东亚', category: 'global' },
    { lng: 151.2093, lat: -33.8688, name: '悉尼', hint: '大洋洲', category: 'global' },
    { lng: -43.1729, lat: -22.9068, name: '里约热内卢', hint: '南美', category: 'global' },
    { lng: 37.6173, lat: 55.7558, name: '莫斯科', hint: '欧洲/亚洲', category: 'global' },
    { lng: -99.1332, lat: 19.4326, name: '墨西哥城', hint: '北美', category: 'global' },
    { lng: 31.2357, lat: 30.0444, name: '开罗', hint: '非洲', category: 'global' },
    { lng: 28.0473, lat: -26.2041, name: '约翰内斯堡', hint: '非洲', category: 'global' },
    { lng: -58.3816, lat: -34.6037, name: '布宜诺斯艾利斯', hint: '南美', category: 'global' },
    { lng: 100.5018, lat: 13.7563, name: '曼谷', hint: '东南亚', category: 'global' },
    // China
    { lng: 116.4074, lat: 39.9042, name: '北京', hint: '中国', category: 'china' },
    { lng: 121.4737, lat: 31.2304, name: '上海', hint: '中国', category: 'china' },
    { lng: 113.2644, lat: 23.1291, name: '广州', hint: '中国', category: 'china' },
    { lng: 104.0657, lat: 30.5728, name: '成都', hint: '中国', category: 'china' },
    { lng: 114.0579, lat: 22.5431, name: '深圳', hint: '中国', category: 'china' },
    { lng: 108.9402, lat: 34.2611, name: '西安', hint: '中国', category: 'china' },
    { lng: 120.1551, lat: 30.2741, name: '杭州', hint: '中国', category: 'china' },
    { lng: 106.5044, lat: 29.5332, name: '重庆', hint: '中国', category: 'china' },
    { lng: 87.6209, lat: 43.8256, name: '乌鲁木齐', hint: '中国', category: 'china' },
    { lng: 91.1333, lat: 29.6500, name: '拉萨', hint: '中国', category: 'china' },
    { lng: 126.6424, lat: 45.7570, name: '哈尔滨', hint: '中国', category: 'china' },
    { lng: 117.2000, lat: 39.0833, name: '天津', hint: '中国', category: 'china' },
    // Nature wonders
    { lng: -112.1154, lat: 36.1069, name: '大峡谷', hint: '自然奇观', category: 'nature' },
    { lng: -63.6167, lat: -8.7833, name: '亚马逊雨林', hint: '自然奇观', category: 'nature' },
    { lng: 37.9062, lat: -2.9962, name: '乞力马扎罗山', hint: '自然奇观', category: 'nature' },
    { lng: 149.1287, lat: -35.3075, name: '堪培拉', hint: '大洋洲', category: 'global' },
    { lng: 126.9780, lat: 37.5665, name: '首尔', hint: '东亚', category: 'global' },
    { lng: 103.8198, lat: 1.3521, name: '新加坡', hint: '东南亚', category: 'global' },
    { lng: 80.2707, lat: 13.0827, name: '金奈', hint: '南亚', category: 'global' },
    { lng: -77.0369, lat: 38.9072, name: '华盛顿', hint: '北美', category: 'global' },
    { lng: -3.7038, lat: 40.4168, name: '马德里', hint: '欧洲', category: 'global' },
    { lng: 12.4964, lat: 41.9028, name: '罗马', hint: '欧洲', category: 'global' },
    { lng: 153.0260, lat: -27.4698, name: '布里斯班', hint: '大洋洲', category: 'global' },
  ];

  // ---- callbacks ----

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  notify(): void {
    this.onStateChange?.();
  }

  // ---- getters ----

  get rounds(): GeoGuessrRound[] { return this._rounds; }
  get currentRound(): number { return this._currentRound; }
  get totalRounds(): number { return this._totalRounds; }
  get phase(): string { return this._phase; }
  get gameCategory(): string { return this._gameCategory; }
  get engine() { return this.ctx?.engine ?? null; }
  get currentLocation(): GeoGuessrLocation | null {
    return this._rounds[this._currentRound]?.location ?? null;
  }

  // ---- game logic ----

  startGame(category: GeoGuessrLocation['category'] = 'global', rounds = 5): void {
    this._gameCategory = category;
    this._totalRounds = rounds;

    const pool = GeoGuessrTool.LOCATIONS.filter(
      (l) => category === 'global' || l.category === category,
    );
    if (pool.length === 0) return;

    // Shuffle and pick
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    this._rounds = shuffled.slice(0, rounds).map((loc) => ({
      location: loc,
      guess: null,
      score: 0,
      distance: 0,
    }));
    this._currentRound = 0;
    this._phase = 'exploring';

    // Fly to first location
    this.flyToCurrentLocation();
    this.notify();
  }

  private flyToCurrentLocation(): void {
    const engine = this.ctx?.engine;
    const loc = this.currentLocation;
    if (!engine || !loc) return;
    engine.flyTo([loc.lng, loc.lat], 14, { duration: 1500 });
  }

  /** 用户点击「开始猜测」进入猜测阶段 */
  startGuessing(): void {
    this._phase = 'guessing';
    this.notify();
  }

  /** 用户提交猜测 */
  submitGuess(guessLngLat: LngLat): GeoGuessrRound {
    const round = this._rounds[this._currentRound];
    if (!round) return { location: { lng: 0, lat: 0, name: '', hint: '', category: 'global' }, guess: null, score: 0, distance: 0 };

    const distMeters = haversineMeters(
      round.location.lat, round.location.lng,
      guessLngLat[1], guessLngLat[0],
    );

    // Score
    let score: number;
    if (distMeters < 500) score = 5000;
    else if (distMeters < 2000) score = 4000;
    else if (distMeters < 5000) score = 3000;
    else if (distMeters < 10000) score = 2000;
    else score = Math.max(0, Math.round(2000 * (1 - (distMeters - 10000) / 90000)));

    round.guess = guessLngLat;
    round.score = Math.max(0, Math.min(5000, score));
    round.distance = distMeters;

    this._phase = 'result';
    this.notify();
    return round;
  }

  nextRound(): void {
    if (this._currentRound < this._totalRounds - 1) {
      this._currentRound++;
      this._phase = 'exploring';
      this.flyToCurrentLocation();
    } else {
      this._phase = 'idle'; // game over
    }
    this.notify();
  }

  get totalScore(): number {
    return this._rounds.reduce((sum, r) => sum + r.score, 0);
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
  }

  deactivate(): void {
    this.active = false;
    this.ctx = null;
    this._phase = 'idle';
  }

  isActive(): boolean {
    return this.active;
  }
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
