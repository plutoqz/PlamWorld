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

  // ---- built-in location pool (100+ verified locations) ----
  private static LOCATIONS: GeoGuessrLocation[] = [
    // Global Metropolises & Landmarks
    { lng: -0.1276, lat: 51.5074, name: '伦敦', hint: '泰晤士河畔的大本钟与塔桥', category: 'global' },
    { lng: 2.3522, lat: 48.8566, name: '巴黎', hint: '塞纳河畔的埃菲尔铁塔与卢浮宫', category: 'global' },
    { lng: -74.0060, lat: 40.7128, name: '纽约', hint: '曼哈顿天际线与自由女神像', category: 'global' },
    { lng: 139.6503, lat: 35.6762, name: '东京', hint: '繁华的新宿与东京塔', category: 'global' },
    { lng: 151.2093, lat: -33.8688, name: '悉尼', hint: '海湾旁的悉尼歌剧院与海港大桥', category: 'global' },
    { lng: -43.1729, lat: -22.9068, name: '里约热内卢', hint: '科科瓦多山上的基督像与面包山', category: 'global' },
    { lng: 37.6173, lat: 55.7558, name: '莫斯科', hint: '红场克里姆林宫与瓦西里升天大教堂', category: 'global' },
    { lng: -99.1332, lat: 19.4326, name: '墨西哥城', hint: '阿兹特克故地与宪法广场', category: 'global' },
    { lng: 31.2357, lat: 30.0444, name: '开罗', hint: '尼罗河三角洲南端的吉萨金字塔群', category: 'global' },
    { lng: 28.0473, lat: -26.2041, name: '约翰内斯堡', hint: '南非黄金之城', category: 'global' },
    { lng: -58.3816, lat: -34.6037, name: '布宜诺斯艾利斯', hint: '拉普拉塔河南岸的探戈故乡', category: 'global' },
    { lng: 100.5018, lat: 13.7563, name: '曼谷', hint: '湄南河畔的大皇宫与郑王庙', category: 'global' },
    { lng: 149.1287, lat: -35.3075, name: '堪培拉', hint: '精心规划的花园首都', category: 'global' },
    { lng: 126.9780, lat: 37.5665, name: '首尔', hint: '汉江两岸与景福宫', category: 'global' },
    { lng: 103.8198, lat: 1.3521, name: '新加坡', hint: '马六甲海峡明珠与滨海湾', category: 'global' },
    { lng: 72.8777, lat: 19.0760, name: '孟买', hint: '印度之门与阿拉伯海岸', category: 'global' },
    { lng: -77.0369, lat: 38.9072, name: '华盛顿', hint: '波托马克河畔的白宫与国会山', category: 'global' },
    { lng: -122.4194, lat: 37.7749, name: '旧金山', hint: '金门海峡与标志性橙色悬索桥', category: 'global' },
    { lng: 55.2708, lat: 25.2048, name: '迪拜', hint: '波斯湾畔的哈利法塔与人工棕榈岛', category: 'global' },
    { lng: 28.9784, lat: 41.0082, name: '伊斯坦布尔', hint: '横跨欧亚大陆的博斯普鲁斯海峡', category: 'global' },
    { lng: -79.3832, lat: 43.6532, name: '多伦多', hint: '安大略湖畔的 CN 塔', category: 'global' },
    { lng: 174.7633, lat: -36.8485, name: '奥克兰', hint: '千帆之都与海湾天空塔', category: 'global' },
    { lng: 18.4241, lat: -33.9249, name: '开普敦', hint: '大西洋与印度洋交汇处桌山脚下', category: 'global' },
    { lng: -70.6693, lat: -33.4489, name: '圣地亚哥', hint: '安第斯山脉脚下的智利首都', category: 'global' },
    { lng: 106.8456, lat: -6.2088, name: '雅加达', hint: '爪哇岛西北海岸的繁华都市', category: 'global' },
    { lng: -21.9426, lat: 64.1466, name: '雷克雅未克', hint: '冰岛最北部的地热之都', category: 'global' },
    { lng: 39.2083, lat: 21.4858, name: '吉达', hint: '红海之滨的古老商港', category: 'global' },
    { lng: -47.8825, lat: -15.7942, name: '巴西利亚', hint: '飞机造型的现代主义规划首都', category: 'global' },

    // China
    { lng: 116.4074, lat: 39.9042, name: '北京', hint: '华北平原北端，紫禁城与天安门', category: 'china' },
    { lng: 121.4737, lat: 31.2304, name: '上海', hint: '长江入海口，外滩与陆家嘴三件套', category: 'china' },
    { lng: 113.2644, lat: 23.1291, name: '广州', hint: '珠江之畔，羊城与小蛮腰', category: 'china' },
    { lng: 104.0657, lat: 30.5728, name: '成都', hint: '天府之国，锦里宽窄与都江堰水系', category: 'china' },
    { lng: 114.0579, lat: 22.5431, name: '深圳', hint: '大湾区科创之都，平安金融中心', category: 'china' },
    { lng: 108.9402, lat: 34.2611, name: '西安', hint: '关中平原，古都长安与大雁塔', category: 'china' },
    { lng: 120.1551, lat: 30.2741, name: '杭州', hint: '西湖十景与钱塘江大潮', category: 'china' },
    { lng: 106.5044, lat: 29.5332, name: '重庆', hint: '嘉陵江与长江汇合处的山城', category: 'china' },
    { lng: 87.6209, lat: 43.8256, name: '乌鲁木齐', hint: '天山北麓，离海洋最远的大都市', category: 'china' },
    { lng: 91.1333, lat: 29.6500, name: '拉萨', hint: '雪域高原日光城，布达拉宫', category: 'china' },
    { lng: 126.6424, lat: 45.7570, name: '哈尔滨', hint: '松花江畔冰城，圣索菲亚教堂', category: 'china' },
    { lng: 117.2000, lat: 39.0833, name: '天津', hint: '海河之津，意式风情街与天津之眼', category: 'china' },
    { lng: 114.3055, lat: 30.5928, name: '武汉', hint: '九省通衢，黄鹤楼与长江大桥', category: 'china' },
    { lng: 118.7969, lat: 32.0603, name: '南京', hint: '六朝古都十朝都会，紫金山玄武湖', category: 'china' },
    { lng: 110.2991, lat: 25.2742, name: '桂林', hint: '漓江山水甲天下，喀斯特峰林奇观', category: 'china' },
    { lng: 109.5119, lat: 18.2528, name: '三亚', hint: '南海之滨鹿回头，亚龙湾热带天堂', category: 'china' },
    { lng: 102.7123, lat: 25.0406, name: '昆明', hint: '滇池之畔春城，西山龙门', category: 'china' },
    { lng: 120.3826, lat: 36.0671, name: '青岛', hint: '黄海之滨红瓦绿树，栈桥八大关', category: 'china' },
    { lng: 118.1000, lat: 24.4667, name: '厦门', hint: '鹭岛鼓浪屿，琴声与环岛海滨', category: 'china' },
    { lng: 120.5853, lat: 31.2989, name: '苏州', hint: '东方威尼斯，拙政园与平江水弄', category: 'china' },
    { lng: 94.6620, lat: 40.1421, name: '敦煌', hint: '河西走廊西端，莫高窟与鸣沙山月牙泉', category: 'china' },
    { lng: 110.4792, lat: 29.1171, name: '张家界', hint: '砂岩峰林地貌，三千奇峰天子山', category: 'china' },
    { lng: 103.9186, lat: 33.2600, name: '九寨沟', hint: '岷山深处的童话世界，五彩池诺日朗', category: 'china' },
    { lng: 100.2257, lat: 26.8721, name: '丽江', hint: '玉龙雪山下大研古镇，木府风云', category: 'china' },
    { lng: 121.5654, lat: 25.0330, name: '台北', hint: '淡水河畔台北101与阳明山', category: 'china' },

    // Europe
    { lng: 2.3522, lat: 48.8566, name: '巴黎', hint: '法兰西浪漫之都，塞纳河与凯旋门', category: 'europe' },
    { lng: -0.1276, lat: 51.5074, name: '伦敦', hint: '大不列颠心脏，泰晤士河与大本钟', category: 'europe' },
    { lng: 12.4964, lat: 41.9028, name: '罗马', hint: '永恒之城，古罗马斗兽场与梵蒂冈', category: 'europe' },
    { lng: 13.4050, lat: 52.5200, name: '柏林', hint: '施普雷河畔勃兰登堡门与博物馆岛', category: 'europe' },
    { lng: -3.7038, lat: 40.4168, name: '马德里', hint: '伊比利亚半岛中心，马约尔广场与普拉多', category: 'europe' },
    { lng: 16.3738, lat: 48.2082, name: '维也纳', hint: '多瑙河畔音乐之都，美泉宫与金色大厅', category: 'europe' },
    { lng: 4.9041, lat: 52.3676, name: '阿姆斯特丹', hint: '运河纵横的风车郁金香之都', category: 'europe' },
    { lng: 14.4378, lat: 50.0755, name: '布拉格', hint: '伏尔塔瓦河畔千塔之城，查理大桥', category: 'europe' },
    { lng: 23.7275, lat: 37.9838, name: '雅典', hint: '西方文明发源地，卫城帕特农神庙', category: 'europe' },
    { lng: 18.0686, lat: 59.3293, name: '斯德哥尔摩', hint: '梅拉伦湖与波罗的海峡湾十四岛', category: 'europe' },
    { lng: 8.5417, lat: 47.3769, name: '苏黎世', hint: '阿尔卑斯湖北岸的金融中心', category: 'europe' },
    { lng: 19.0402, lat: 47.4979, name: '布达佩斯', hint: '多瑙河上的明珠，布达城堡与塞切尼链桥', category: 'europe' },
    { lng: 2.1734, lat: 41.3851, name: '巴塞罗那', hint: '地中海滨高迪之城，圣家堂与兰布拉', category: 'europe' },
    { lng: -3.1883, lat: 55.9533, name: '爱丁堡', hint: '苏格兰古老首府，皇家一哩路与古堡', category: 'europe' },
    { lng: 11.2558, lat: 43.7696, name: '佛罗伦萨', hint: '文艺复兴发源地翡冷翠，圣母百花大教堂', category: 'europe' },
    { lng: 12.3155, lat: 45.4408, name: '威尼斯', hint: '亚得里亚海潟湖水城，圣马可广场与贡多拉', category: 'europe' },
    { lng: -9.1393, lat: 38.7223, name: '里斯本', hint: '特茹河畔七丘之城，贝伦塔与黄色电车', category: 'europe' },
    { lng: 12.5683, lat: 55.6761, name: '哥本哈根', hint: '新港童话小美人鱼与厄勒海峡', category: 'europe' },
    { lng: 21.0122, lat: 52.2297, name: '华沙', hint: '维斯瓦河畔涅槃重生的波兰古城', category: 'europe' },
    { lng: -6.2603, lat: 53.3498, name: '都柏林', hint: '利菲河畔健力士故乡与圣三一学院', category: 'europe' },
    { lng: 10.7522, lat: 59.9139, name: '奥斯陆', hint: '奥斯陆峡湾尽头的维京之都', category: 'europe' },
    { lng: 24.9384, lat: 60.1699, name: '赫尔辛基', hint: '芬兰湾畔白教堂与千湖之国门', category: 'europe' },

    // Nature Wonders
    { lng: -112.1154, lat: 36.1069, name: '科罗拉多大峡谷', hint: '科罗拉多河深切数亿年形成的红色岩层峡谷', category: 'nature' },
    { lng: -63.6167, lat: -8.7833, name: '亚马逊热带雨林', hint: '地球之肺，南美洲广阔的绿色流域', category: 'nature' },
    { lng: 37.3556, lat: -3.0674, name: '乞力马扎罗山', hint: '非洲屋脊赤道雪山，坦桑尼亚独立火山体', category: 'nature' },
    { lng: 138.7274, lat: 35.3606, name: '富士山', hint: '日本最高峰，对称优美的休眠活火山锥', category: 'nature' },
    { lng: 25.8572, lat: -17.9243, name: '维多利亚瀑布', hint: '赞比西河上跌落的“咆哮的浓烟”大瀑布', category: 'nature' },
    { lng: 147.6992, lat: -18.2871, name: '大堡礁', hint: '南太平洋珊瑚海中世界最大珊瑚礁群', category: 'nature' },
    { lng: 18.9553, lat: 69.6492, name: '特罗姆瑟峡湾', hint: '北极圈内极光之都与壮丽北欧峡湾', category: 'nature' },
    { lng: 35.5000, lat: 31.5000, name: '死海', hint: '地球陆地表面最低点，极高盐度内陆湖', category: 'nature' },
    { lng: 29.1211, lat: 37.9250, name: '棉花堡', hint: '安纳托利亚高原上的白色梯级温泉钙华池', category: 'nature' },
    { lng: -67.4891, lat: -20.1338, name: '乌尤尼盐沼', hint: '安第斯高原上的巨大“天空之镜”', category: 'nature' },
    { lng: -79.0849, lat: 43.0896, name: '尼亚加拉大瀑布', hint: '美加交界处马蹄瀑布与巨大水雾', category: 'nature' },
    { lng: 86.9250, lat: 27.9881, name: '珠穆朗玛峰大本营', hint: '喜马拉雅山脉世界之巅北坡', category: 'nature' },
    { lng: -54.4367, lat: -25.6953, name: '伊瓜苏大瀑布', hint: '阿根廷与巴西交界的壮阔马蹄形瀑布群', category: 'nature' },
    { lng: 107.1839, lat: 20.9101, name: '下龙湾', hint: '北部湾水上喀斯特石灰岩岛屿奇观', category: 'nature' },
    { lng: -115.5708, lat: 51.1784, name: '班夫国家公园', hint: '加拿大落基山脉绿松石般的路易斯湖', category: 'nature' },
    { lng: 7.6583, lat: 45.9764, name: '马特洪峰', hint: '阿尔卑斯山标志性四棱锥金字塔形角峰', category: 'nature' },
    { lng: 170.1417, lat: -44.6717, name: '米尔福德峡湾', hint: '新西兰南岛冰川切削出的雄伟海湾峭壁', category: 'nature' },
    { lng: -155.2833, lat: 19.4167, name: '夏威夷基拉韦厄火山', hint: '太平洋板块热点上的活跃盾状火山与熔岩湖', category: 'nature' },
    { lng: 107.5739, lat: -7.9944, name: '布罗莫火山', hint: '爪哇岛古老火山口沙海中喷烟的活火山', category: 'nature' },
    { lng: 25.3960, lat: 36.3932, name: '圣托里尼火山口', hint: '爱琴海沉没火山环礁与悬崖蓝顶白房', category: 'nature' },
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

    // 真实 GeoGuessr 5000分制指数衰减曲线
    // 25 米以内满分 5000；误差随地理尺度平滑过渡，告别 >100km 直接 0 分的荒谬计算
    let score: number;
    if (distMeters <= 25) {
      score = 5000;
    } else {
      const distKm = distMeters / 1000;
      let scaleKm = 2000; // global 默认衰减尺度
      if (this._gameCategory === 'china' || this._gameCategory === 'europe') {
        scaleKm = 700;
      } else if (this._gameCategory === 'nature') {
        scaleKm = 1400;
      }
      score = Math.max(0, Math.min(5000, Math.round(5000 * Math.exp(-distKm / scaleKm))));
    }

    round.guess = guessLngLat;
    round.score = score;
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
