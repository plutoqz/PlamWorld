# 🗺️ PalmWorld — 项目统筹规划文档

> 最后更新：2025-07-27  
> 状态：v0.5 已完成，v0.6 已完成 ✅

---

## 一、项目概述

**PalmWorld** 是一个智能化、解耦的多功能 Web 地图应用。支持卫星影像、导航地图、地形图等多种图源，具备常规地图操作能力，并通过插件化架构预留 AI 分析、时空穿梭等高级功能的扩展入口。

### 1.1 核心设计原则

| 原则 | 说明 |
|------|------|
| **解耦优先** | 地图引擎、图源、工具均通过接口抽象，互不直接依赖 |
| **渐进增强** | MVP 最小可用，架构预留扩展点，后续功能按插件接入 |
| **类型安全** | TypeScript strict mode，全量类型覆盖 |
| **纯静态可部署** | 无后端依赖，所有数据源走公开 API / 静态瓦片服务 |
| **性能优先** | Web Worker 处理计算密集任务，主线程只负责渲染 |

### 1.2 MVP 范围与版本路线

```
v0.1 MVP ──── 核心地图浏览
  ✅ 多图源切换（卫星 / 导航 / 地形）
  ✅ 3D 地形渲染（MapLibre Terrain3D）
  ✅ 地名搜索 + 飞行动画定位
  ✅ GPS 定位（浏览器 Geolocation）
  ✅ 标准地图操作（缩放/旋转/倾斜/指南针复位）
  ✅ 图源一键切换

v0.2 ──── 对比 + 测量 + 基础空间分析
  ✅ 双屏 / 滑动帘对比模式
  ✅ 距离测量 + 面积测量
  ✅ **地形剖线** ⬅ 详见第十一节
     沿路径提取 DEM 高程，交互式剖面图
     Canvas 渲染，鼠标悬停同步地图标记
  ✅ **累计爬升/下降** ⬅ 详见第十一节
     总爬升/总下降/净变化/平均&最大坡度
     难度评级（平缓→中等→挑战→极限）
  ✅ **海平面上升模拟** ⬅ 详见第十四节
     交互式水位滑块，实时 DEM 淹没可视化

v0.3 ──── 进阶空间分析 + 核心亮点
  ✅ **通视分析** ⬅ 详见第十二节
     从视点做 360° 射线追踪 DEM
     horizon line 算法，Worker 渐进计算
  ✅ **坡度/坡向分析** ⬅ 详见第十三节
     DEM 梯度卷积 → 坡度色阶图 + 坡向分类图
  ✅ **真实大小比较** ⬅ 详见第十节
     重叠模式：拖动行政区幽灵图层到任意纬度
     实时 Mercator 缩放校正，直观感受投影失真
     内置 Natural Earth 国家/省界 + OSM Overpass API 城市查询
  ✅ **基础热力图** ⬅ 详见第十八节
     核密度估计 (KDE)，turf.js + Worker 计算
     支持用户导入 CSV 点数据或地图点击采集
  ✅ **离线地图（PMTiles）** ⬅ 详见第十九节
     PMTiles 单文件全球矢量瓦片，HTTP Range Request 按需加载
     替代 IndexedDB 自建缓存方案，生态更成熟
  ✅ 自定义图层导入（GeoJSON / GPX / KML）
  ✅ 时空穿梭（多年份卫星影像对比）
  ✅ 3D 飞行漫游

v0.4 ──── 趣味可视化 + 视觉 + 叙事
  ✅ **地图投影实时切换** ⬅ 详见第十五节
     Mercator ↔ Globe ↔ Equal Earth ↔ Robinson
     D3-geo / Versor dragging 实现
  ✅ **阳光阴影模拟** ⬅ 详见第十六节
     选日期+时间 → 计算太阳位置 → 动态 hillshade
     可视化日照时长分布
  ✅ **峰顶识别器** ⬅ 详见第十七节
     点击视点 → 标注可见山峰 + 名称 + 距离
     OSM natural=peak 数据库 + 通视计算
  ✅ **故事地图 / 叙事构建器** ⬅ 详见第二十节
     创建章节序列（视图状态 + 标注 + 多媒体）
     Zustand 状态快照 → 序列化 → 回放动画
  ✅ **GeoGuessr 趣味模式** ⬅ 详见第二十一节
     随机投放地点 → 用户猜位置 → 计分
     作为趣味插件示例，验证工具系统的灵活性
  ✅ **趣味地图生成（专题数据地图）** ⬅ 详见第二十二节
     用户上传 CSV/JSON → 区域匹配 → 色阶映射
     中国人口流出 / GDP 增速 / 各省房价... 任意数据即地图
  🔲 3D 建筑挤出（OSM building footprints）

v0.5 ──── 水文分析 + AI 增强
  ✅ **水文分析** ⬅ 详见第二十三节
     流向/流域/湿度指数，D8 算法 + DEM 查询
     复用 v0.3 DEM 格网计算管线
  ✅ 卫星图 AI 分析（建筑物轮廓 / 植被覆盖率）
  ✅ 智能地点摘要
  ✅ 自然语言地图搜索

v0.6 ──── 增强分析 + 文学地图 ✅
  ✅ **通视分析增强** ⬅ 详见第二十四节
     多观察点合成覆盖 / 信号覆盖热力 / 雷达扇形可视域
     多点互视矩阵
  ✅ **路径规划 & 可视化** ⬅ 详见第二十五节
     A* / Dijkstra 搜索 + 高程代价 / 等时线 (Isochrone)
  ✅ **地质剖面可视化** ⬅ 详见第二十六节
     岩层结构剖面 / Macrostrat API / Canvas 双板渲染
  ✅ **古代疆域矢量叠加** ⬅ 详见第二十七节
     多朝代疆域 Polygon 时间轴 / 朝代对比模式
  ✅ **生态 & 生物多样性** ⬅ 详见第二十八节
     物种分布范围 / 迁徙路线动画 / IUCN 热力
  ✅ **山海经 & 文学地图框架** ⬅ 详见第二十九节
     ILiteraryMapSource 通用接口 / 双空间耦合渲染
     山海经 v1 (36锚点/3路线)
```

---

## 二、技术栈

### 2.1 选型总览

| 层级 | 选型 | 版本 | 理由 |
|------|------|------|------|
| **语言** | TypeScript | 5.x | strict mode，全量类型 |
| **前端框架** | React | 18.x | 生态最成熟，并发特性 |
| **构建工具** | Vite | 5.x | 秒级 HMR，原生 ESM |
| **地图引擎** | MapLibre GL JS | 4.x | 开源 WebGL，矢量瓦片 + 3D 地形 + 自定义样式 |
| **状态管理** | Zustand | 4.x | 轻量，支持切片，无 boilerplate |
| **样式方案** | TailwindCSS | 3.x | 原子化，JIT 编译 |
| **UI 组件** | shadcn/ui | latest | 高质量无依赖，Radix 原语 |
| **地理计算** | turf.js | 7.x | 浏览器端 GIS 计算标准 |
| **KML/GPX** | @tmcw/togeojson | latest | KML/GPX → GeoJSON |
| **测试** | Vitest | 1.x | Vite 原生集成 |
| **代码规范** | ESLint + Prettier | latest | 标准配置 |
| **瓦片缓存** | idb (IndexedDB) | latest | 离线缓存底层存储（v0.3） |
| **PWA** | vite-plugin-pwa | latest | Service Worker 封装（v0.3） |

### 2.2 为什么选择 MapLibre GL JS

| 对比维度 | MapLibre GL JS | Leaflet | OpenLayers | CesiumJS |
|----------|---------------|---------|------------|----------|
| 渲染方式 | WebGL（GPU） | Canvas/DOM | Canvas/WebGL | WebGL（3D 地球） |
| 3D 地形 | ✅ 原生 Terrain3D | ❌ 需插件 | ❌ 有限 | ✅ 完整地球 |
| 矢量瓦片 | ✅ 原生 | ❌ 需插件 | ✅ 支持 | ✅ 需配置 |
| 自定义样式 | ✅ Mapbox Style Spec | ❌ | ✅ 有限 | ❌ |
| 包体积 | ~350KB gzip | ~40KB | ~200KB | ~2MB+ |
| 学习曲线 | 中等 | 低 | 高 | 高 |
| 多实例 | ✅ | ✅ | ✅ | ⚠️ 资源重 |

**结论**：MapLibre 是 2D/2.5D 地图的最佳平衡点。未来如需 3D 地球可迁移到 CesiumJS（接口抽象保证切换成本可控）。Leaflet 作为降级方案的适配器保留在架构中。

---

## 三、架构设计

### 3.1 分层架构图

```
┌──────────────────────────────────────────────────────────┐
│                     UI Layer                             │
│     React Components (shadcn/ui + TailwindCSS)           │
│     MapView / SourceSwitcher / SearchBar / ToolBar       │
├──────────────────────────────────────────────────────────┤
│                   Tool Plugin System                     │
│   ToolRegistry → [SearchTool, LocateTool, MeasureTool…]  │
│   每个工具独立文件，注册/激活/停用生命周期                  │
├──────────────────────────────────────────────────────────┤
│             Map Engine Abstraction (中间路线)             │
│   IMapEngine ── 核心操作接口                              │
│   getNative() ── 泄漏底层引擎（高级工具按需使用）           │
│                                                          │
│   ┌─────────────────┬──────────────┬────────────────┐     │
│   │ MapLibreAdapter │ LeafletAdapter│ CesiumAdapter │     │
│   │    (主实现)      │  (降级/备用)  │  (未来3D地球)  │     │
│   └─────────────────┴──────────────┴────────────────┘     │
├──────────────────────────────────────────────────────────┤
│             Tile Source Abstraction                      │
│   ITileSource ── 图源接口（含时间维度）                     │
│                                                          │
│   ┌──────┬──────────┬───────────┬──────────┬─────────┐   │
│   │ OSM  │  ESRI   │ OpenTopo  │ 天地图   │ Custom  │   │
│   │ 矢量 │ 卫星    │  地形     │ (未来)   │  自定义  │   │
│   └──────┴──────────┴───────────┴──────────┴─────────┘   │
├──────────────────────────────────────────────────────────┤
│              State Management (Zustand)                  │
│   mapStore ── 引擎实例、视图状态、活动图源                  │
│   uiStore  ── 面板显隐、工具状态、用户偏好                  │
├──────────────────────────────────────────────────────────┤
│              Worker Layer (Web Worker)                   │
│   geoWorker ── turf.js 计算、GeoJSON 解析、瓦片处理        │
├──────────────────────────────────────────────────────────┤
│              Data / Services                             │
│   Nominatim (搜索) / 公开瓦片服务 / 公开 DEM 瓦片          │
│   纯前端，无后端依赖                                       │
└──────────────────────────────────────────────────────────┘
```

### 3.2 核心接口定义

#### IMapEngine — 地图引擎抽象

```ts
// core/engine.ts

type EngineKind = 'maplibre' | 'leaflet' | 'cesium';

interface MapEngineOptions {
  container: HTMLElement;
  center: [lng: number, lat: number];
  zoom: number;
  pitch?: number;       // 俯仰角（3D）
  bearing?: number;     // 旋转角
  attributionControl?: boolean;
}

interface IMapEngine {
  readonly kind: EngineKind;

  // 生命周期
  mount(options: MapEngineOptions): void;
  destroy(): void;

  // 视角控制
  flyTo(center: [number, number], zoom?: number, options?: FlyToOptions): void;
  setPitch(pitch: number): void;
  setBearing(bearing: number): void;
  fitBounds(bounds: LngLatBounds, options?: FitBoundsOptions): void;

  // 图层
  setTileSource(source: ITileSource): void;
  addGeoJsonLayer(data: GeoJSON.FeatureCollection, style?: LayerStyle): string; // 返回 layerId
  removeLayer(layerId: string): void;

  // 事件
  on(event: MapEvent, handler: MapEventHandler): void;
  off(event: MapEvent, handler: MapEventHandler): void;

  // 查询
  getCenter(): [number, number];
  getZoom(): number;
  getBounds(): LngLatBounds;

  // 截图（保留给 AI 分析用）
  captureViewport(options?: CaptureOptions): Promise<Blob>;

  // 底层泄漏（高级工具按需取用）
  getNative(): unknown;
}
```

**设计要点：**
- `captureViewport()` 为 AI 分析预留，MapLibre 有原生 `getCanvas().toBlob()`
- `getNative()` 是中间路线的关键——例如「3D 飞行漫游」工具需要直接调用 MapLibre 的 `freeCamera API`，它声明 `requiresEngine: 'maplibre'`
- 多实例支持：每次 `mount()` 创建一个独立引擎实例，互不干扰

#### ITileSource — 图源抽象（含时间维度）

```ts
// core/source.ts

type TileSourceType = 'raster' | 'vector' | 'terrain';
type TileSourceCategory = 'satellite' | 'navigation' | 'topo' | 'custom';

interface ITileSource {
  readonly id: string;
  readonly name: string;
  readonly type: TileSourceType;
  readonly category: TileSourceCategory;
  readonly year?: number;           // 🕐 时空维度预留
  readonly tileUrl: string | string[];
  readonly attribution: string;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly tileSize?: number;       // 默认 256
  readonly apiKey?: string;         // 未来需要 key 的图源

  /** 转为引擎特定格式的 style/url 配置 */
  toEngineConfig(engineKind: EngineKind): unknown;
}
```

**设计要点：**
- `year` 可选字段 —— MVP 不使用，但已存在于接口中，后续「时空穿梭」无需改接口
- `toEngineConfig()` 让每个图源自己知道如何适配不同引擎
- `category` 用于 UI 分组展示（卫星 / 导航 / 地形三个 tab）

#### MapTool — 工具插件接口

```ts
// core/tools.ts

interface ToolContext {
  engine: IMapEngine;
  mapStore: MapStore;      // Zustand store
  uiStore: UIStore;
}

interface MapTool {
  readonly id: string;
  readonly name: string;
  readonly icon: string;                // lucide icon name
  readonly description: string;
  readonly requiresEngine?: EngineKind; // 引擎依赖声明
  readonly exclusive?: boolean;         // 激活时是否停用其他工具

  activate(ctx: ToolContext): void;
  deactivate(): void;
  isActive(): boolean;
}
```

### 3.3 目录结构

```
PalmWorld/
├── public/
│   ├── favicon.svg
│   └── manifest.json              # PWA manifest
├── src/
│   ├── core/                      # 核心抽象层
│   │   ├── engine.ts              # IMapEngine 接口 + 通用类型
│   │   ├── source.ts              # ITileSource 接口
│   │   ├── tools.ts               # MapTool + ToolRegistry
│   │   ├── projection.ts          # 🆕 Mercator 投影变换引擎（v0.3）
│   │   ├── terrain.ts             # 🆕 地形分析共享工具（v0.2）
│   │   ├── (choropleth.ts)         # 🆕 Choropleth 分类器+匹配引擎（v0.4）
│   │   └── types.ts               # 通用 GIS 类型（LngLat, Bounds…）
│   │
│   ├── engines/                   # 引擎适配器
│   │   └── maplibre/
│   │       ├── adapter.ts         # MapLibreAdapter implements IMapEngine
│   │       ├── terrain.ts         # 3D 地形配置
│   │       └── capture.ts         # 视口截图实现
│   │
│   ├── sources/                   # 图源定义
│   │   ├── registry.ts            # 图源注册表（预置 + 动态注册）
│   │   ├── osm-vector.ts          # OpenStreetMap 矢量瓦片
│   │   ├── esri-satellite.ts      # ESRI World Imagery
│   │   ├── open-topo.ts           # OpenTopoMap
│   │   └── terrain-dem.ts         # 地形 DEM 瓦片源
│   │
│   ├── data/                      # 🆕 内置静态数据（v0.3）
│   │   └── boundaries/            # 内置行政区 GeoJSON/TopoJSON
│   │       ├── ne_10m_admin_0_countries.json   # Natural Earth 国家
│   │       └── ne_10m_admin_1_states_provinces.json # 省/州
│   │
│   ├── hooks/                     # React Hooks
│   │   ├── useMap.ts              # 地图实例生命周期
│   │   ├── useMapSource.ts        # 图源切换
│   │   ├── useGeolocation.ts      # 浏览器定位
│   │   └── useSearch.ts           # 地名搜索
│   │
│   ├── stores/                    # Zustand 状态
│   │   ├── mapStore.ts            # 地图核心状态
│   │   └── uiStore.ts             # UI 状态
│   │
│   ├── tools/                     # 工具插件
│   │   ├── registry.ts            # ToolRegistry 实现
│   │   ├── search.tool.ts         # 地名搜索工具
│   │   ├── locate.tool.ts         # GPS 定位工具
│   │   ├── (measure.tool.ts)      # 测量工具（v0.2）
│   │   ├── (elevation-profile.tool.ts)  # 🆕 地形剖线（v0.2）
│   │   ├── (climb-analysis.tool.ts)     # 🆕 爬升分析（v0.2）
│   │   ├── (sea-level-rise.tool.ts)     # 🆕 海平面上升（v0.2）
│   │   ├── (true-size.tool.ts)    # 🆕 真实大小比较（v0.3）
│   │   ├── (viewshed.tool.ts)     # 🆕 通视分析（v0.3）
│   │   ├── (slope-aspect.tool.ts) # 🆕 坡度坡向（v0.3）
│   │   ├── (heatmap.tool.ts)      # 🆕 热力图（v0.3）
│   │   ├── (projection-switch.tool.ts)  # 🆕 投影切换（v0.4）
│   │   ├── (sunlight-shadow.tool.ts)    # 🆕 阳光阴影（v0.4）
│   │   ├── (peak-finder.tool.ts)        # 🆕 峰顶识别（v0.4）
│   │   ├── (story-map.tool.ts)          # 🆕 故事地图（v0.4）
│   │   ├── (geoguessr.tool.ts)          # 🆕 GeoGuessr（v0.4）
│   │   ├── (choropleth.tool.ts)         # 🆕 趣味地图生成（v0.4）
│   │   └── (hydrology.tool.ts)          # 🆕 水文分析（v0.5）
│   │
│   ├── workers/                   # Web Worker
│   │   ├── geo.worker.ts          # 地理计算 Worker
│   │   └── worker-bridge.ts       # 主线程 ↔ Worker 通信桥
│   │
│   ├── components/                # React 组件
│   │   ├── map/
│   │   │   ├── MapView.tsx        # 地图主视图
│   │   │   ├── MapInstance.tsx    # 单个地图实例封装
│   │   │   └── Attribution.tsx    # 版权信息
│   │   ├── controls/
│   │   │   ├── SourceSwitcher.tsx # 图源切换面板
│   │   │   ├── SearchBar.tsx      # 搜索栏
│   │   │   ├── ToolBar.tsx        # 工具栏
│   │   │   ├── Compass.tsx        # 指南针复位
│   │   │   ├── GeolocateButton.tsx# GPS 定位按钮
│   │   │   └── ZoomControls.tsx   # 缩放控件
│   │   ├── panels/
│   │   │   ├── LayerPanel.tsx     # 图层管理面板（v0.2+）
│   │   │   └── (TrueSizePanel.tsx) # 🆕 真实大小比较面板（v0.3）
│   │   ├── true-size/             # 🆕 真实大小比较子组件（v0.3）
│   │   │   ├── GhostShape.tsx     # 幽灵图层（可拖动 + 实时缩放）
│   │   │   └── CompareResult.tsx  # 面积对比结果卡片
│   │   ├── terrain/               # 🆕 地形分析子组件（v0.2+）
│   │   │   ├── ElevationProfile.tsx    # 交互式剖面图（Canvas）
│   │   │   ├── ClimbStats.tsx          # 爬升/下降统计卡片
│   │   │   ├── FloodLayer.tsx          # 海平面淹没图层
│   │   │   ├── HeatmapLayer.tsx        # 🆕 热力图图层（v0.3）
│   │   │   └── (ViewshedLayer.tsx)     # 通视二值栅格图层（v0.3）
│   │   ├── visual/                # 🆕 趣味可视化子组件（v0.4+）
│   │   │   ├── ProjectionView.tsx      # D3 投影切换迷你地球
│   │   │   ├── SunlightControl.tsx     # 日照时间轴 + 光源控制
│   │   │   ├── PeakLabels.tsx          # 可见山峰标签
│   │   │   ├── (StoryPlayer.tsx)       # 🆕 故事章节播放器（v0.4）
│   │   │   ├── (ChoroplethPanel.tsx)   # 🆕 专题地图控制面板（v0.4）
│   │   │   ├── (DataPreview.tsx)       # 🆕 CSV 数据预览表格（v0.4）
│   │   │   ├── (ColorRampPicker.tsx)   # 🆕 色阶选择器（v0.4）
│   │   │   └── (MapLegend.tsx)         # 🆕 地图图例组件（v0.4）
│   │   └── ui/                    # shadcn/ui 组件
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css                  # TailwindCSS 入口
│
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── .eslintrc.cjs
├── .prettierrc
└── PROJECT_PLAN.md                # 本文件
```

---

## 四、状态管理设计

### 4.1 Zustand Store 设计

```ts
// stores/mapStore.ts
interface MapState {
  // 引擎实例引用
  engine: IMapEngine | null;

  // 视图状态
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;

  // 图源状态
  activeSourceId: string;
  availableSources: ITileSource[];

  // 3D 地形
  terrain3d: boolean;

  // 操作
  setEngine: (engine: IMapEngine) => void;
  setView: (view: Partial<Pick<MapState, 'center' | 'zoom' | 'pitch' | 'bearing'>>) => void;
  switchSource: (sourceId: string) => void;
  toggleTerrain3d: () => void;
}

// stores/uiStore.ts
interface UIState {
  activeToolId: string | null;
  searchOpen: boolean;
  sourcePanelOpen: boolean;
  sidebarOpen: boolean;

  setActiveTool: (toolId: string | null) => void;
  toggleSearch: () => void;
  toggleSourcePanel: () => void;
}
```

---

## 五、Web Worker 架构

### 5.1 为什么现在就引入

- turf.js 的面积/距离/缓冲区计算在主线程会阻塞 UI（尤其是在移动端）
- 后续 KML/GPX 解析也是 CPU 密集任务
- Worker 基础设施搭建成本低（~100 行代码），收益持久

### 5.2 通信协议

```ts
// workers/worker-bridge.ts

type WorkerMessage =
  | { id: string; type: 'CALCULATE_AREA'; payload: GeoJSON.Polygon }
  | { id: string; type: 'CALCULATE_DISTANCE'; payload: GeoJSON.LineString }
  | { id: string; type: 'PARSE_GEOJSON'; payload: string }
  | { id: string; type: 'PARSE_GPX'; payload: string }
  | { id: string; type: 'PARSE_KML'; payload: string }
  | { id: string; type: 'PROJECT_TRANSFORM'; payload: {
      feature: GeoJSON.Feature;
      nativeCentroid: [number, number];
      targetCentroid: [number, number];
    } }  // 🆕 True Size 经纬度重投影变换（v0.3）
  | { id: string; type: 'SAMPLE_ELEVATIONS'; payload: {
      path: [number, number][];     // 路径坐标
      elevations: number[];         // DEM 高程数组（主线程查询）
      interval: number;             // 采样间距（米）
    } }  // 🆕 剖线 + 爬升计算（v0.2）
  | { id: string; type: 'VIEWSHED'; payload: {
      origin: [number, number, number]; // [lng, lat, height_m]
      demGrid: number[][];               // DEM 格网（方形）
      cellSize: number;                  // 格网分辨率（米）
      radius: number;                    // 可视半径（米）
    } }  // 🆕 通视分析（v0.3）
  | { id: string; type: 'SLOPE_ASPECT'; payload: {
      demGrid: number[][];
      cellSize: number;
    } }  // 🆕 坡度坡向计算（v0.3）

type WorkerResponse =
  | { id: string; type: 'RESULT'; payload: number }
  | { id: string; type: 'GEOJSON'; payload: GeoJSON.FeatureCollection }
  | { id: string; type: 'ERROR'; payload: string };

// 基于 Comlink 风格的 Promise 化调用
function callWorker(msg: WorkerMessage): Promise<WorkerResponse>;
```

---

## 六、图源配置

### 6.1 MVP 图源清单

| ID | 名称 | 类型 | 分类 | 来源 |
|----|------|------|------|------|
| `osm-vector` | OpenStreetMap | vector | navigation | `https://tile.openstreetmap.org/{z}/{x}/{y}.png`（raster 降级开始） |
| `osm-liberty` | OSM Liberty | vector | navigation | MapLibre 开源矢量样式 |
| `esri-satellite` | ESRI World Imagery | raster | satellite | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` |
| `open-topo` | OpenTopoMap | raster | topo | `https://tile.opentopomap.org/{z}/{x}/{y}.png` |
| `terrain-dem` | Terrain DEM | terrain | topo | MapLibre Terrain3D 公开 DEM 源 |

### 6.2 后续可扩展图源

| ID | 名称 | 注意事项 |
|----|------|----------|
| `tianditu-vec` | 天地图矢量 | 需要 API Key，WGS84 → GCJ-02 偏移 |
| `tianditu-img` | 天地图卫星 | 同上 |
| `google-satellite` | Google 卫星 | 需考虑合规性 |
| `mapbox-satellite` | Mapbox 卫星 | 需要 API Key |

---

## 七、开发环境与脚本

### 7.1 脚本命令

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext .ts,.tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "typecheck": "tsc --noEmit"
  }
}
```

### 7.2 部署

- **目标**：GitHub Pages / Vite 一键 `vite build` 导出纯静态文件
- **CI/CD**（可选）：GitHub Actions → `build` → deploy to Pages
- **基准 URL**：`/PalmWorld/`（GitHub Pages 项目页）

---

## 八、风险与约束

| 风险 | 缓解措施 |
|------|----------|
| MapLibre Terrain3D 的公开 DEM 源不稳定 | 预配置 2 个备选 DEM 源 |
| Nominatim 搜索有频率限制（1 req/s） | 前端 debounce 500ms + 错误友好提示 |
| OSM Overpass API 查询大区域可能超时 | 设置 15s 超时 + 提示用户缩小范围或使用内置数据 |
| OSM 瓦片服务无 SLA | ESRI 卫星图为默认首选，OSM 为备选 |
| Web Worker 不支持 ES module import | Vite `?worker` 后缀自动处理 |
| 纯静态：无法做服务端 API 聚合 | 所有功能走客户端直连公开 API |
| `queryTerrainElevation` 有每帧调用上限 | 批量查询分帧调度，Worker 做 CPU 密集计算（剖线/通视） |
| 通视分析大范围（>50km）计算耗时 | 渐进渲染 + 进度条，先展示近处结果 |
| 山峰数据库体积大（~15MB） | TopoJSON 精简 + 按需懒加载 |

---

## 九、下一步行动

- [ ] 初始化 Vite + React + TS 项目
- [ ] 安装核心依赖（MapLibre, Zustand, TailwindCSS, shadcn/ui）
- [ ] 搭建 `core/` 接口定义
- [ ] 实现 `MapLibreAdapter`
- [ ] 实现 MVP 图源（ESRI 卫星 + OSM 矢量 + OpenTopo 地形）
- [ ] 实现 `MapView` 组件 + 图源切换
- [ ] 实现 SearchBar + GPS 定位
- [ ] 实现 ToolRegistry + 基础工具
- [ ] 配置 Web Worker 基础设施
- [ ] 部署到 GitHub Pages

---

## 十、真实大小比较功能设计（v0.3）

### 10.1 问题域

Mercator 投影在纬度 φ 处面积失真 ≈ `1/cos²(φ)`——赤道附近区域的视觉面积是实际面积的 ~1x，而格陵兰岛（~70°N）在地图上看比实际大 ~8.5 倍。本功能通过**动态重投影**让用户直观感受投影失真，并通过幽灵图层拖动实现跨纬度真实面积比较。

### 10.2 核心算法

```
输入：区域 A（纬度 φ₁）的 GeoJSON，目标纬度 φ₂
输出：面积等价的幽灵 GeoJSON

步骤：
1. 将 A 所有坐标投影到 Mercator (EPSG:3857) → A_merc
2. 计算 A_merc 的质心
3. 缩放因子：scale = cos(φ₁) / cos(φ₂)
   - φ₂ > φ₁ → scale > 1（向北移，幽灵变大）
   - φ₂ < φ₁ → scale < 1（向南移，幽灵缩小）
4. 以质心为原点对 A_merc 做 scale 变换
5. 平移到目标位置（B 区域的 Mercator 质心）
6. 逆投影回 WGS84 → 幽灵 GeoJSON
```

### 10.3 交互模式

#### 重叠模式（MVP 先做）

```
┌──────────────────────────────┐
│         Map View              │
│                              │
│   ┌──────────┐               │
│   │ 新余市    │ ← 原生位置    │
│   └──────────┘               │
│            ┌──────────────┐  │
│            │ 成都市        │  │
│            │ ┌──────────┐ │  │
│            │ │ 新余(幽灵) │ │  │
│            │ │ 缩小至     │ │  │
│            │ │ 真实比例   │ │  │
│            │ └──────────┘ │  │
│            └──────────────┘  │
└──────────────────────────────┘

📊 新余市: 3,178 km²  |  成都建成区: 1,439 km²
→ 新余市面积是成都建成区的 2.2x
```

- 选择区域 A + 区域 B
- 地图上高亮两个区域的原生位置
- 区域 A 的幽灵半透明填充，可拖动
- 拖动过程中随纬度实时缩放
- 拖到 B 上方时自动对齐提示

#### 并排放置（v0.4）

利用多实例架构，左右各一 MapInstance，同缩放级别联动。

### 10.4 UI 组件树

```
TrueSizeTool (激活)
├── TrueSizePanel.tsx          # 侧栏面板
│   ├── RegionSelector A       # 搜索/选择区域A
│   ├── RegionSelector B       # 搜索/选择区域B
│   ├── 数据来源切换            # 内置 Natural Earth / OSM Overpass / 导入 GeoJSON
│   └── CompareResult.tsx      # 面积数字 + 百分比对比卡片
│
├── RegionOutline A (底层)     # 区域A原生轮廓（实线 + 填充）
├── RegionOutline B (底层)     # 区域B原生轮廓（实线 + 填充）
│
└── GhostShape.tsx             # 幽灵图层（可拖动）
    ├── 半透明填充 (opacity 0.4)
    ├── 拖动中 → 实时重投影计算
    └── 松手 → 固定位置 + 显示对比结果
```

### 10.5 数据获取策略

```
优先级 1 ── 内置 Natural Earth
  ✅ 离线可用，加载快
  ✅ 覆盖所有国家 (level-0) 和省/州 (level-1)
  ❌ 无市/区级数据

优先级 2 ── OSM Overpass API
  ✅ 可查询任意 admin_level
  ✅ 全球覆盖
  ❌ 需网络，大区域可能超时
  示例查询（新余市）：
  [out:json]; relation["name"="新余市"]["admin_level"="5"]; out geom;

优先级 3 ── 用户自定义导入
  ✅ 支持 GeoJSON / GPX / KML 拖拽导入
  ✅ 适合精确边界（如成都建成区）
```

### 10.6 性能策略

| 场景 | 策略 |
|------|------|
| 顶点 < 500 | 主线程直接计算，requestAnimationFrame 更新 |
| 顶点 500-5000 | 主线程 + 节流到 30fps |
| 顶点 > 5000 | 发送到 Web Worker 计算，结果回来再 setData() |
| 拖动中 | 只渲染幽灵，隐藏其余非必要图层 |
| 静止 | 全量渲染 + 面积对比数据 |

### 10.7 MapLibre 渲染实现

```ts
// 幽灵图层: 两个 GeoJSON source + 两个 layer
const GHOST_SOURCE_ID = 'true-size-ghost';

// source
map.addSource(GHOST_SOURCE_ID, {
  type: 'geojson',
  data: ghostFeatureCollection,
});

// fill（半透明填充）
map.addLayer({
  id: `${GHOST_SOURCE_ID}-fill`,
  source: GHOST_SOURCE_ID,
  type: 'fill',
  paint: {
    'fill-color': '#ff6b35',
    'fill-opacity': 0.35,
  },
});

// outline（实线描边）
map.addLayer({
  id: `${GHOST_SOURCE_ID}-line`,
  source: GHOST_SOURCE_ID,
  type: 'line',
  paint: {
    'line-color': '#e63946',
    'line-width': 2,
  },
});

// 拖动更新（节流）
function onGhostDrag(targetLat: number) {
  const transformed = projection.transformToLatitude(
    regionAFeature,
    nativeCentroid,
    [currentLng, targetLat],
  );
  map.getSource(GHOST_SOURCE_ID).setData(transformed);
}
```

### 10.8 工具注册

```ts
// tools/true-size.tool.ts
const TrueSizeTool: MapTool = {
  id: 'true-size',
  name: '真实大小比较',
  icon: 'scale',               // lucide icon
  description: '拖动行政区对比真实面积，直观感受 Mercator 投影失真',
  requiresEngine: 'maplibre',  // 依赖 MapLibre 的 setData 性能
  exclusive: true,             // 激活时关闭其他工具

  activate(ctx) { /* 初始化区域选择器 + 幽灵图层 */ },
  deactivate()   { /* 清理图层 + 还原 UI */ },
};
```

### 10.9 架构影响汇总

| 已利用的现有设计 | 新增模块 |
|-----------------|---------|
| `IMapEngine.addGeoJsonLayer()` + `removeLayer()` | `core/projection.ts` |
| `MapTool` 插件注册 | `tools/true-size.tool.ts` |
| Web Worker `geo.worker.ts` 计算管线 | `data/boundaries/` 内置数据 |
| 引擎抽象 `getNative()`（幽灵图层更新直接调用 MapLibre API） | `components/true-size/` UI 组件 |
| `uiStore` 面板显隐 + `mapStore` 图层状态 | Overpass API 查询模块 |

---

## 十一、地形剖线 & 爬升分析（v0.2）

### 11.1 概述

在地图上绘制路径，从 DEM（通过 MapLibre Terrain RGB 瓦片）沿线提取高程数据，生成交互式剖面图，并在此基础上计算累计爬升、下降、坡度及难度评级。

### 11.2 DEM 数据获取

MapLibre 内置 `map.queryTerrainElevation(lngLat)` 可直接从 Terrain3D 的 Terrain RGB 瓦片中查询任一点的高程，无需额外 API。

```ts
// 每帧最多查询 256 个点，批量采样需控制频率
const elevation = map.queryTerrainElevation({ lng: 114.06, lat: 22.54 });
```

### 11.3 交互流程

```
1. 用户激活「剖线」工具
2. 在地图上双击 → 起点
3. 单击 → 中间途经点（可多次）
4. 双击 → 终点（自动闭合路径）
5. 底部面板展开，显示剖面图

交互：
- 鼠标悬停剖面图 → 地图上标记对应位置
- 拖拽剖面图的端点 → 路径同步更新
- 点击「爬升统计」标签切换视图
```

### 11.4 剖面计算

```
1. 沿路径等距采样（默认 30m 间距，用户可调）
2. 对每个采样点调用 queryTerrainElevation()
3. 批量请求（每批 256 点，批间 50ms 间隔避免 API 断流）
4. 结果回填 elevation 数组

{ samplingPoint, distance: 累计距离(m), elevation: 高程(m) }[]
```

### 11.5 剖面图渲染（Canvas）

```
纵轴 = 高程（自动适配 min/max，留 10% margin）
横轴 = 累计距离

绘制顺序：
1. 渐变填充区域（海拔着色方案）：
   <500m   → 深绿 → 浅绿 → 黄色
   500-1500 → 黄褐 → 棕色
   >1500m  → 灰白

2. 路径曲线（平滑折线）
3. 最高点/最低点标记 ⬆️
4. 鼠标悬停竖线 + 浮动标注
```

### 11.6 爬升分析

从剖面高程数组计算：

```
总爬升 = Σ max(h[i] - h[i-1], 0)
总下降 = Σ max(h[i-1] - h[i], 0)
净变化 = h[end] - h[start]
最大坡度 = max(|h[i] - h[i-1]| / d[i])    (d[i] = 段长)
平均坡度 = 总爬升 / 总距离 × 100%

难度评级：
  平缓 (< 3%)  │  中等 (3-8%)  │  挑战 (8-15%)  │  极限 (> 15%)
```

剖面图上可选「爬升热力色模式」——红 = 陡坡，绿 = 平路。

### 11.7 架构影响

| 依赖 | 说明 |
|------|------|
| MapLibre `queryTerrainElevation()` | 需 Terrain3D 已启用 |
| `core/terrain.ts` | 共享地形工具函数 |
| Web Worker | 大数据路径的采样计算 |

---

## 十二、通视分析（v0.3）

### 12.1 算法概述

```
输入：视点 P(lng, lat, height)、DEM 格网、可视半径 R
输出：可见/不可见二值栅格 → 渲染为半透明图层

算法采用 accelerated horizon line 方法（O(n²) → O(n log n)）：
1. 以 P 为原点，将 DEM 格网按方位角分组
2. 对每个方位角，从近到远遍历
3. 维护「到当前为止的最大仰角」（horizon）
4. 如果当前格网仰角 > horizon → 可见 → 更新 horizon
5. 如果当前格网仰角 ≤ horizon → 被遮挡
```

### 12.2 实现策略

```
第一阶段（主线程）：
  1. 获取视点周围 R 范围内的 DEM 数据（从 Terrain3D 瓦片采样）
  2. 构建 [2R/cellSize × 2R/cellSize] 的局部 DEM 格网
  3. 发送到 Worker

第二阶段（Worker）：
  4. horizon line 算法计算 viewshed 二值数组
  5. 渐进返回结果（先近后远，分 4 象限）

第三阶段（主线程）：
  6. 将二值数组渲染为 MapLibre image source 或 GeoJSON
  7. 可见=绿色半透明，不可见=红色半透明
```

### 12.3 用户交互

```
- 点击地图放置视点
- 拖动视点位置
- 滑块调节：
  - 观察者高度（1m ~ 300m）
  - 可视半径（1km ~ 100km）
- 点击目标位置 → 弹出「可见/不可见」判定 + 视线剖面
```

### 12.4 性能预估

| DEM 分辨率 | 半径 | 格网大小 | Worker 耗时（估算） |
|-----------|------|---------|-------------------|
| 30m | 10km | 667×667 | ~200ms |
| 30m | 50km | 3333×3333 | ~2-5s（需渐进渲染） |
| 90m (SRTM) | 50km | 1111×1111 | ~400ms |

对于大范围（>20km），使用渐进渲染 + 进度条，先展示近处结果。

---

## 十三、坡度/坡向分析（v0.3）

### 13.1 算法

采用 Horn (1981) 方法，对 DEM 每个格网用 3×3 窗口做梯度卷积：

```
格网：
  NW   N   NE
   W  中心   E
  SW   S   SE

∂z/∂x = (NE + 2E + SE - NW - 2W - SW) / (8 × cellSize)
∂z/∂y = (NE + 2N + NW - SE - 2S - SW) / (8 × cellSize)

坡度 = atan(√((∂z/∂x)² + (∂z/∂y)²))       → 角度或百分比
坡向 = atan2(-∂z/∂y, -∂z/∂x)              → 0°=北 顺时针
```

### 13.2 渲染

```
坡度色阶（覆盖在地图上）：
  0°  (平地)    = 深绿色
  5°            = 浅绿
  15°           = 黄色
  30°           = 橙色
  45°+ (陡崖)   = 红色

坡向分类（8 方向）：
  北=蓝, 东北=青, 东=绿, 东南=黄绿
  南=黄, 西南=橙, 西=红, 西北=紫
```

### 13.3 交互

```
- 开关图层：坡度图 / 坡向图 / 关
- 鼠标悬停 → 显示该点坡度 + 坡向 + 高程
- v0.2 剖线路径上叠加坡度着色
```

---

## 十四、海平面上升模拟（v0.2）

### 14.1 原理

```
对当前视口范围的 DEM 格网做一次全量查询
水位线 = 当前海平面 + 用户设定增量（0-100m）
DEM 格网值 < 水位线 → 淹没
```

### 14.2 实现

```
UI：底部滑块，0 到 +100m，步进 1m
渲染：MapLibre fill-extrusion 或 raster 图层
  淹没区域 = 蓝色半透明填充
  边界线 = 深蓝色描边（新的海岸线）

性能：DEM 查询一次（1-2s），置入 image source 后不再更新
  拖动滑块只更新 fill-extrusion-height 属性（毫秒级）
```

### 14.3 为什么 v0.2 就做

实现极其简单但视觉冲击力极强，代码量 ~150 行。和剖线/爬升共用 `core/terrain.ts` 的 DEM 查询工具。

---

## 十五、地图投影切换（v0.4）

### 15.1 原理

MapLibre 固定使用 Web Mercator (EPSG:3857)。要切换投影，需要叠一个独立的 D3-geo Canvas 层来重新投影世界地图数据。

### 15.2 支持投影

| 投影 | 视觉效果 | d3 方法 |
|------|---------|---------|
| Mercator（默认） | 标准 web 地图 | `d3.geoMercator()` |
| Orthographic（地球仪） | 3D 地球，可旋转 | `d3.geoOrthographic()` |
| Equal Earth | 等面积，大陆形状自然 | `d3.geoEqualEarth()` |
| Robinson | 妥协投影，经典世界地图 | `d3.geoRobinson()` |
| Winkel Tripel | National Geographic 标准 | `d3.geoWinkel3()` |

### 15.3 交互

```
- 顶部按钮组，点击切换投影
- Orthographic 模式下支持鼠标拖拽旋转地球（versor dragging）
- 切换动画：平滑过渡（d3.transition）
- 迷你预览图显示当前投影下的世界轮廓

架构：独立 Canvas 层，不侵入 MapLibre 渲染管线
  → 切换回 Mercator 时恢复 MapLibre 地图
```

---

## 十六、阳光阴影模拟（v0.4）

### 16.1 原理

```
给定日期 + 时间 + 位置(lat, lng)
  → 计算太阳方位角 azimuth + 高度角 altitude
  → 对 DEM 做 hillshade 计算
  → 渲染为半透明阴影图层

hillshade = 255 * (cos(zenith) * cos(slope)
             + sin(zenith) * sin(slope) * cos(azimuth - aspect))
```

### 16.2 太阳位置计算

```ts
// suncalc 库，纯 JS，无依赖
import SunCalc from 'suncalc';
const pos = SunCalc.getPosition(date, lat, lng);
// → { azimuth, altitude }
```

### 16.3 交互

```
- 时间轴滑块（0:00 → 24:00，步进 15 分钟）
- 日期选择器
- 「播放」按钮 → 日出到日落自动动画
- 阴影图层叠加在地形/卫星图上
- 冬季 vs 夏季对比模式
```

### 16.4 为什么和 v0.2/0.3 相关

坡度坡向计算（v0.3）和阳光阴影共享底层 hillshade 算法。v0.3 做好计算管线，v0.4 只需加 suncalc + 时间轴 UI。

---

## 十七、峰顶识别器（v0.4）

### 17.1 原理

```
输入：用户点击的视点 P(lng, lat)，观察者高度
输出：可见山峰列表 + 地图标签（名称/海拔/距离）

数据：OSM natural=peak 全球山峰数据库（预下载 TopoJSON）
      约 450,000 个山峰（~15MB TopoJSON）

流程：
1. 从山峰数据库筛选视点周围 100km 内的山峰
2. 排除高程低于视点 + 观察者高度的山峰
3. 对剩余山峰跑简化的 horizon line 通视（复用 v0.3 算法）
4. 可见山峰按距离排序，限制显示前 20 个
5. 地图上绘制射线 + 角度扇形 + 标签卡片
```

### 17.2 交互

```
- 点击地图放置视点
- 射线 fan out 到可见山峰
- 标签卡片：山名 | 海拔 4,810m | 距离 42.3km | 方位 NE
- 点击标签 → flyTo 该山峰
- 截图模式：生成全景山峰标注图

灵感来源：PeakFinder AR / peakvisor.com
```

### 17.3 数据预处理

OSM `natural=peak` 数据需要预处理：用 Overpass API 导出全球 → 过滤掉无名小丘 → 精简到 TopoJSON（点特征）→ 打包进 `public/data/peaks.topojson`。

---

## 十八、基础热力图（v0.3）

### 18.1 原理

核密度估计（KDE）：将离散点数据在空间上做平滑，生成连续密度表面。

```
对每个输出格网像素：
  density[pixel] = Σ K(distance(pixel, point_i) / bandwidth)
  其中 K = Epanechnikov 或 Gaussian 核

turf.kernelWeight() + turf.interpolate() 提供内置实现
大数据量（>5000 点）丢到 Worker 计算
```

### 18.2 数据源

```
1. 用户导入 CSV（lng, lat, [weight]）
2. 地图上点击手动采集点
3. 内置示例：全球地震点 / 城市人口密度
```

### 18.3 渲染

```
- MapLibre heatmap layer（原生支持）:
  paint: {
    'heatmap-weight': weight,
    'heatmap-radius': 可调,
    'heatmap-color': [蓝 → 绿 → 黄 → 红],
    'heatmap-opacity': 可调,
  }
- 带宽滑块（影响光滑程度）
- 单元格大小自动适配视口
```

---

## 十九、离线地图 PMTiles（v0.3）

### 19.1 为什么选 PMTiles

| 对比 | PMTiles | IndexedDB 自建 |
|------|---------|---------------|
| 实现方式 | 单个文件 + HTTP Range Request | 瓦片逐张存入 IndexedDB |
| 生态 | protomaps.js / maplibre-gl-pmtiles | 全自建 |
| 离线 | 下载一个文件即可 | 需预缓存大量瓦片 |
| 协议 | PMTiles v3 规范 | 自定义 |
| 全球矢量 | ~100GB（完整 OSM） | 不现实 |
| 小范围 | 城市级 ~50MB | ~50MB 但碎片多 |

### 19.2 集成方式

```ts
// 1. 安装依赖
// npm install pmtiles

// 2. 在 MapLibre 中使用 PMTiles 协议
import { Protocol } from 'pmtiles';
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

// 3. 加载本地或远程 PMTiles 文件
map.addSource('pmtiles-source', {
  type: 'vector',
  url: 'pmtiles://data/planet_z12.pmtiles',
});
```

### 19.3 离线策略

```
MVP (v0.3):    在线加载远程 PMTiles（如 Protomaps 公开版）
离线增强:       用户下载城市级 PMTiles → 放 public/data/ → 离线可用
PWA (v0.3):    Service Worker 缓存 PMTiles 文件（单文件友好）
```

---

## 二十、故事地图 / 叙事构建器（v0.4）

### 20.1 核心思路

故事地图的本质是「Zustand 状态的快照序列 + 回放引擎」——不需要任何新架构：

```
Chapter {
  id: string;
  title: string;
  description: string;         // Markdown
  media?: { type: 'image'|'video'; url: string };
  viewState: {                 // 地图状态快照
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
    activeSourceId: string;
    layers: string[];          // 可见图层 ID 列表
  };
  annotations?: GeoJSON.Feature[];  // 本章标注
  transition?: 'fly'|'ease'|'cut';
  duration?: number;           // 过渡时长 (ms)
}

StoryMap {
  id: string;
  title: string;
  chapters: Chapter[];
  exportDate: string;
}
```

### 20.2 交互

```
编辑模式：
  - 侧栏章节列表，拖拽排序
  - 「捕获当前视图」→ 保存为章节
  - 每章可加图片/文字说明

播放模式：
  - 自动 flyTo 过渡到每章视图
  - 底部进度条 + 前后翻页
  - 媒体弹出层

导出：
  - JSON（可导入回 PalmWorld）
  - 静态 HTML（独立分享）
```

### 20.3 实现要点

```
- 纯 Zustand 快照 → JSON.stringify → localStorage / 导出文件
- 回放 = 遍历 chapters 逐章 flyTo
- 标注图层 = GeoJSON source.setData() 动态更新
- 独立 HTML 导出 = 最小化 shell + 预渲染地图配置
```

---

## 二十一、GeoGuessr 趣味模式（v0.4）

### 21.1 设计

```
1. 从预置地点库随机选取位置
2. 地图 flyTo 到该位置（随机俯仰角 + 方向）
3. 用户拖动地图探索 → 在 minimap 上点击猜测位置
4. 计算猜测点与真实点的距离 → 评分
5. 5 轮一局，显示总分 + 排行榜（localStorage）

评分规则：
  0-500m:   5000 分
  500m-2km: 4000 分
  2km-10km: 2000 分
  10km+:    距离越远分越低，0 分地板
```

### 21.2 地点库

```
内置 ~500 个精选地点（打包为 JSON）
  来源：Natural Earth populated places + 知名地标
  分层：全球 / 中国 / 欧洲 / 自然奇观
  每个地点：{ lng, lat, hint, category }
```

### 21.3 架构验证价值

GeoGuessr 本身是一个有趣功能，但它还有一个附加价值：**验证工具系统的灵活性**。如果 GeoGuessr 能作为一个纯插件、不碰核心代码就实现，说明 MapTool 接口设计是正确的。

---

## 二十二、趣味地图生成 / 专题数据地图（v0.4）

### 22.1 概述

用户上传表格数据（CSV / JSON / Excel），选择地理粒度（全球国家 / 中国省份 / 美国州…），
系统自动匹配区域名称→边界 GeoJSON，生成颜色映射的 Choropleth 专题地图。

**典型场景：**
- 中国各省人口净流出 / 流入地图
- GDP 增速色阶图（红=高增长，蓝=低增长）
- 各省平均房价热力
- 世界碳排放 / 人均寿命 / 选举结果
- 任何「区域名 + 数值」的数据表

### 22.2 数据流

```
用户上传 CSV/JSON
      │
      ▼
┌── 解析表格（papaparse / JSON.parse）────┐
│  自动识别列名 + 前 5 行预览             │
└─────────────────────────────────────────┘
      │
      ▼
┌── 列映射 ──────────────────────────────┐
│  用户选择：                             │
│    区域名列 = "省份" / "Country"        │
│    数值列   = "GDP增速" / "Population" │
│    (可选) 分组列 = "年份"               │
└─────────────────────────────────────────┘
      │
      ▼
┌── 区域匹配 ────────────────────────────┐
│  对区域名做 fuzzy match 到边界数据      │
│  报告匹配率：已匹配 31/34，未匹配 […]  │
│  允许用户手动修正未匹配项              │
└─────────────────────────────────────────┘
      │
      ▼
┌── 分类 + 配色 ─────────────────────────┐
│  分类法：等间隔 / 分位数 / Jenks / 手动 │
│  色阶：  单色序 / 双色序 / 发散色      │
│  色阶来源：ColorBrewer / d3-scale-chromatic │
└─────────────────────────────────────────┘
      │
      ▼
┌── MapLibre fill layer ─────────────────┐
│  paint: {                               │
│    'fill-color': ['interpolate',        │
│      ['linear'], ['get', 'value'],      │
│      v1, c1, v2, c2, ...               │
│    ],                                   │
│    'fill-opacity': 0.75,                │
│  }                                      │
│  + hover 高亮 + tooltip                │
└─────────────────────────────────────────┘
```

### 22.3 分类方法

| 方法 | 算法 | 适用场景 |
|------|------|---------|
| **等间隔 Equal Interval** | (max-min)/k | 均匀分布数据 |
| **分位数 Quantile** | 每类等量样本 | 偏态分布（人口/经济） |
| **Jenks 自然断点** | 最小化类内方差 | 有天然聚类的数据（推荐） |
| **手动分段** | 用户自定义断点 | 有行业标准阈值 |
| **连续渐变色** | 不分段，线性映射 | 高精度色阶展示 |

Jenks Natural Breaks 依赖 `simple-statistics` 或 `geostats` 库，其他方法在 `core/choropleth.ts` 纯函数实现。

### 22.4 色阶方案

| 类型 | ColorBrewer 示例 | 使用场景 |
|------|-----------------|---------|
| **单色序 Sequential** | Blues / Reds / Greens | GDP、人口（正值，从浅到深） |
| **多色序 Multi-hue Sequential** | YlOrRd / Viridis / Magma | 热力、密度（感知均匀） |
| **发散 Diverging** | RdBu / BrBG / PiYG | 增长率、净迁移（有正负中点） |
| **分类 Qualitative** | Set3 / Pastel1 | 离散类别（地区分区） |

色阶库选型：`d3-scale-chromatic`（已随 d3-geo 安装，~5KB tree-shakable）。

### 22.5 区域匹配引擎

```ts
// core/choropleth.ts

interface MatchResult {
  input: string;            // 用户数据中的区域名
  matched: string | null;   // 匹配到的边界属性名
  score: number;            // 0-1 匹配置信度
  candidates: string[];     // 备选列表（供用户手动选择）
}

interface MatchReport {
  results: MatchResult[];
  matchedCount: number;
  totalCount: number;
  unmatched: MatchResult[];
}
```

**匹配策略：**
1. 精确匹配（大小写不敏感）
2. 标准别名替换：「北京」↔「北京市」、「Guangdong」↔「Guangdong Province」
3. Fuzzy 匹配（Levenshtein distance 或 `fuse.js`）
4. 未匹配项高亮展示，支持用户从边界属性列表中选择 / 手动输入映射

**内置边界数据（复用 v0.3）：**
| 数据集 | 来源 | 粒度 |
|--------|------|------|
| 世界国家 | Natural Earth 110m/50m/10m | 177 国家 |
| 中国省份 | DataV.GeoAtlas / 内置 TopoJSON | 34 省/自治区/直辖市 |
| 美国州 | Natural Earth | 50 州 |

未来扩展：用户上传自定义 GeoJSON 边界。

### 22.6 交互

```
主面板（ChoroplethPanel.tsx）：
  ┌─────────────────────────────────┐
  │ 📂 上传数据    [拖拽或点击选择]  │
  ├─────────────────────────────────┤
  │ 数据预览（前 5 行表格）          │
  ├─────────────────────────────────┤
  │ 区域名列: [省份      ▼]        │
  │ 数值列:   [GDP增速   ▼]        │
  │ 分组列:   [年份      ▼] (可选)  │
  ├─────────────────────────────────┤
  │ 分类方法: [Jenks ▼]  分段数: 5  │
  │ 色阶方案: [RdBu ▼]             │
  ├─────────────────────────────────┤
  │ 匹配报告: 31/34 已匹配          │
  │ [查看未匹配 → 手动修正]         │
  ├─────────────────────────────────┤
  │ [生成地图] [重置] [导出图片]   │
  └─────────────────────────────────┘

地图交互：
  - 鼠标悬停区域 → 高亮 + tooltip（区域名 / 值）
  - 点击区域 → 锁定高亮 + 详情卡片
  - 图例组件浮动在地图角落（自动生成色阶条 + 标签）
  - 分组列存在时 → 底部时间轴切换不同年份/类别
```

### 22.7 实现文件

```
src/
├── core/
│   └── choropleth.ts           # 分类器 + 色阶映射 + 区域匹配引擎
├── tools/
│   └── choropleth.tool.ts      # MapTool 插件注册
├── components/
│   └── visual/
│       ├── ChoroplethPanel.tsx # 主控制面板（数据上传 + 参数配置）
│       ├── DataPreview.tsx     # CSV 预览表格 + 列选择器
│       ├── ColorRampPicker.tsx # 色阶选择器（可视化预览每个方案）
│       └── MapLegend.tsx       # 图例组件（自动生成渐变条 + 标签）
```

### 22.8 依赖

| 包 | 用途 | 大小 |
|----|------|------|
| `papaparse` | CSV 解析（流式，大文件友好） | ~19KB |
| `d3-scale-chromatic` | ColorBrewer 色阶方案 | ~5KB (tree-shaken) |
| `fuse.js` | 模糊区域名匹配 | ~12KB |
| `simple-statistics` | Jenks 自然断点 | ~15KB |
| `xlsx` | Excel .xlsx 解析（可选，按需引入） | ~500KB (不默认打包) |

### 22.9 为什么放在 v0.4

1. **零新基础设施**：复用 v0.3 的边界数据、MapLibre fill layer、Worker 通道、工具注册系统
2. **视觉冲击力强**：Choropleth 是数据可视化中最直观的形式，用户上手即用
3. **验证架构灵活性**：和 GeoGuessr 一样，纯 MapTool 插件实现，不碰核心代码
4. **复用边界数据**：v0.3 的 `data/boundaries/` 直接作为匹配底图
5. **代码量可控**：~800 行 TypeScript，核心逻辑纯函数 + UI 面板

---

## 二十三、水文分析（v0.5）

### 23.1 概述

对 DEM 格网做地表水文分析，包括流向计算、流域划分、湿度指数。

### 23.2 核心算法

```
步骤 1：填洼（Fill Sinks）
  消除 DEM 中的局部洼地（虚假的内流盆地）

步骤 2：D8 流向（Flow Direction）
  对每个格网，指向 8 邻域中最低的方向
  编码：E=1, SE=2, S=4, SW=8, W=16, NW=32, N=64, NE=128

步骤 3：流量累积（Flow Accumulation）
  每个格网 = 上游有多少格网的水流向这里
  高值 = 河道位置

步骤 4：流域划分（Watershed）
  从用户点击的目标点出发
  向上游追溯所有流入该点的格网 → 集水区边界

步骤 5：地形湿度指数（TWI）
  TWI = ln(α / tanβ)
  α = 上游集水面积, β = 局部坡度
  高 TWI = 湿润区（谷底）, 低 TWI = 干燥区（山脊）
```

### 23.3 性能

```
全部计算放 Worker
30m DEM, 10km×10km → ~110K 格网 → < 2s
更大范围分批处理
```

### 23.4 渲染

```
流向图：箭头方向图层（可选）
流量累积：蓝→白热力色阶
流域边界：粗线高亮
TWI：绿→棕渐变
```

---

## 二十四、通视分析增强（v0.6）

### 24.1 概述

在 v0.3 单点通视分析的基础上，扩展为多观察点合成、信号覆盖建模、雷达扇形可视域、以及观察点之间的互视矩阵。

### 24.2 多观察点合成覆盖 (Multi-Observer Viewshed)

```
输入：N 个观察点 {P₁(lng, lat, height), P₂, ..., Pₙ}
输出：合成可见性栅格

算法：
1. 对每个 Pᵢ 独立计算 binary viewshed（复用 v0.3 horizon line）
2. 合成策略（用户可选）：
   a) UNION  —— 任意一点可见（绿色 = 被至少一个点覆盖）
   b) INTERSECT —— 所有点都可见（红色 = 盲区）
   c) MAJORITY—— 多数点可见（热力色阶表示 K/N 覆盖率）
3. 渲染为热力图层：
   0/N 可见 → 红色（完全盲区）
   N/N 可见 → 绿色（全监覆盖）
   中间值 → 黄→橙过渡
```

**用例：** 消防瞭望塔布局优化、军事观察哨部署、基站信号覆盖规划。

### 24.3 信号覆盖热力 (Signal Coverage / RF Propagation)

```
将 viewshed 扩展到包含信号衰减建模：

输入：
  - 发射站位置 + 功率 (dBm) + 频率
  - 可选：天线方向图（全向/定向）

模型（简化的 Longley-Rice / ITM 投影）：
  接收信号 = 自由空间损耗 + 地形衍射损耗
  Loss(d) = 20·log₁₀(d) + 20·log₁₀(f) + 32.4  (FSPL)
  + terrain obstruction penalty（复用 viewshed 遮挡判定）

输出：
  信号强度热力图层（绿=强，黄=中，红=弱/无信号）
  等值线：-70dBm / -85dBm / -100dBm
```

### 24.4 雷达扇形可视域 (Radar Sector View)

```
复用 single-point viewshed，但限制方位角和开角：

参数：
  - 方位角中心 azimuth（如 90° = 正东）
  - 开角 beamWidth（如 60°）
  - 最大半径 radius

渲染：
  扇形半透明填充 + 扇形边框弧线
  内部仍然用 viewshed 做地形遮挡计算
  支持拖拽旋转方向（扇形中心线跟随鼠标）
```

### 24.5 多点互视矩阵 (Inter-Visibility Matrix)

```
输入：N 个标记点
输出：N×N 对称布尔矩阵

算法：
  对每对 (i, j)，沿地球大圆弧线采样 → 查询 DEM 高程
  → 判定是否存在视线遮挡

UI：
  表格视图：✅ 互视 / ❌ 遮挡 / 👁 单向
  地图联动：点击矩阵格 → flyTo 两点 + 绘制视线剖面
  统计摘要：平均可见率、最大盲区集群
```

### 24.6 实现要点

```
- 全部复用 v0.3 viewshed Worker 管线
- 多观察点 UNION/INTERSECT → Worker 内批量计算
- 信号覆盖扩展 = viewshed + 自由空间路径损耗公式（纯 JS，无新依赖）
- 扇形渲染 = MapLibre fill layer + turf.sector() 生成 GeoJSON
- 所有新增功能作为 MapTool 插件注册：'enhanced-viewshed'
```

---

## 二十五、路径规划 & 可视化（v0.6）

### 25.1 概述

在地图上实现 A* / Dijkstra 路径搜索可视化，并扩展到等时线（isochrone）分析。

### 25.2 路网数据

```
数据源：OSM 矢量瓦片（MapLibre 内置）或 Overpass API 导出

路网节点：OSM highway 标签的交叉点
路网边：  节点间连线，权重 = 距离 / 速度
          附加高程代价（从 DEM 查询上坡惩罚）

MVP：   使用 MapLibre 的 queryRenderedFeatures 采样路网
         或预下载小范围 OSM .pbf → 本地解析
进阶：  预构建全国 H3 路由图（serverless）
```

### 25.3 A* / Dijkstra 搜索

```ts
interface RouteOptions {
  start: [lng, lat];
  end: [lng, lat];
  mode: 'walking' | 'cycling' | 'driving';
  avoidSteep?: boolean;      // 避免陡坡（徒步模式）
  maxSlope?: number;          // 最大允许坡度（°）
}

interface RouteResult {
  path: GeoJSON.LineString;
  distance: number;           // 总距离 (km)
  duration: number;           // 预估时间 (min)
  totalClimb: number;         // 累计爬升 (m)
  difficulty: 'easy' | 'moderate' | 'hard' | 'extreme';
  elevationProfile: ElevationSample[];  // 复用 v0.2 剖线管线
}
```

**启发式权重：**
```
步行：  distance / 5km/h    + steepness_penalty（坡度 > 10° → ×1.5）
骑行：  distance / 15km/h   + steepness_penalty（坡度 > 8° → ×2）
驾车：  distance / speed_limit（从 OSM maxspeed 标签读取）
```

### 25.4 等时线 (Isochrone)

```
从一点出发，计算 N 分钟内可达范围：

算法：
1. 对起始点做 Dijkstra 扩展（不指定终点）
2. 记录每个节点到达时间
3. 按时间阈值（5min / 10min / 20min / 30min / 60min）分组
4. 对每组节点计算 α-shape / concave hull → 等时线多边形
5. 渲染为嵌套填充图层（内圈深绿 → 外圈浅绿）

额外支持：
  - 叠加公共交通（GTFS 静态数据）
  - 步行 + 公交混合模式
```

### 25.5 交互

```
- 点击地图 → 起点 + 终点
- 拖动途经点 → 路径实时更新
- 显示路线海拔剖面（复用 v0.2 组件）
- 路径分段高亮：平坦段=绿，上坡=红，下坡=蓝
- 导出 GPX
```

### 25.6 实现要点

```
- A* 算法放 Worker（大规模路网计算）
- 路网数据从 OSM pbf 预下载或在线 Overpass 查询
- 高程代价利用现有 map.queryTerrainElevation()
- 等时线可视化为独立 Canvas 层或 MapLibre fill layer
- 新增依赖：@turf/concave（等时线 hull 计算），或自行实现 α-shape
```

---

## 二十六、地质剖面可视化（v0.6）

### 26.1 概述

在地图上绘制一条剖面线，不仅展示地表高程，还展示地下岩层结构——从地表 DEM 向下，叠加地质层数据。

### 26.2 数据源

```
地质数据来源：
1. USGS OneGeology / Macrostrat API
   GET /api/v2/geologic_units?lat=...&lng=...&radius=...
   → 返回岩层序列（顶部/底部深度、岩性、年代）

2. 全球地质图 (CGMW / GIRAF)
   预下载简化的全球地质多边形 + 属性表
   按 bbox 查询当前视口的地质单元

3. 中国地质数据（1:250 万）
   中国地质调查局公开数据
```

### 26.3 剖面渲染

```
Canvas 纵轴双面板：

上板（地表以上，复用 v0.2）：
  ┌─────────────────────────────┐
  │   /\  /\      /\           │  高程 (m)
  │  /  \/  \    /  \   ___    │  2000
  │ /        \__/    \_/   \   │  1000
  │/                        \__│  0
  └─────────────────────────────┘

下板（地表以下）：
  ┌─────────────────────────────┐
  │════════ 第四纪冲积层 ═══════│  深度
  │▩▩▩▩▩▩▩ 白垩纪砂岩 ▩▩▩▩▩▩▩│  0→100m
  │▓▓▓▓▓▓▓ 侏罗纪石灰岩 ▓▓▓▓▓▓▓│  100→500m
  │████████ 三叠纪页岩 █████████│  500→1200m
  │░░░░░░░░ 二叠纪花岗岩 ░░░░░░░│  1200m+
  └─────────────────────────────┘

岩性配色方案：
  砂岩   = #E8C36A (黄)
  石灰岩 = #87CEEB (蓝灰)
  页岩   = #8B7355 (暗褐)
  花岗岩 = #E88D8D (粉红)
  玄武岩 = #555555 (深灰)
  变质岩 = #A0A0A0 (浅灰条纹)
```

### 26.4 交互

```
- 激活工具 → 在地图上画剖面线
- 左侧地表剖面 + 右侧地下岩层
- 鼠标悬停岩层 → 浮窗：名称/年代/岩性/厚度
- 「钻孔」模式 → 点击地图 → 垂直柱状图（类似测井曲线）
- 多剖面线对比（并列 2-3 个剖面）
```

### 26.5 实现要点

```
- 地质数据按需加载（视口 bbox → Macrostrat API 查询）
- 若 API 不可用 → 降级为纯地形剖面（v0.2 行为）
- 岩层序列为 JSON 数据，缓存于 Zustand store
- Canvas 渲染岩层为彩色矩形条带
```

---

## 二十七、古代疆域矢量叠加（v0.6）

### 27.1 概述

将中国历代疆域、古代行政区划、历史地名作为矢量图层叠加在现势地图上，
支持时间轴拖动和朝代切换，直观展示历史地理变迁。

### 27.2 数据源

```
内置数据（TopoJSON，打包进 public/data/）：
┌──────────────────┬──────────┬──────────────┬──────────┐
│ 朝代             │ 年份     │ 数据类型      │ 数据量   │
├──────────────────┼──────────┼──────────────┼──────────┤
│ 秦 (Qin)         │ -210     │ 郡县边界      │ ~50KB    │
│ 汉 (Han)         │ -100     │ 州郡边界      │ ~80KB    │
│ 三国             │ 220-280  │ 政权边界      │ ~60KB    │
│ 唐 (Tang)        │ 669      │ 道/府边界     │ ~120KB   │
│ 宋 (Song)        │ 1111     │ 路边界        │ ~120KB   │
│ 元 (Yuan)        │ 1290     │ 行省边界      │ ~200KB   │
│ 明 (Ming)        │ 1580     │ 省/府边界     │ ~150KB   │
│ 清 (Qing)        │ 1820     │ 省边界        │ ~150KB   │
│ 民国 (ROC)       │ 1936     │ 省边界        │ ~100KB   │
└──────────────────┴──────────┴──────────────┴──────────┘

数据来源：CHGIS (Harvard) / 谭其骧《中国历史地图集》矢量化数据

海外扩展（按需）：
  罗马帝国 (117 AD)、蒙古帝国 (1279)、
  奥斯曼帝国 (1683)、大英帝国 (1921)
```

### 27.3 交互设计

```
时间轴（底部水平滑块）：
  ├──────┬──────┬──────┬──────┬──────┤
  秦      汉     唐     宋     明     清
  -210   -100   669    1111   1580   1820

  - 拖动滑块 → 当前朝代疆域高亮填充
  - 两个时间点之间 → GPU 粒子插值过渡（点云从旧疆域流动到新疆域）
  - 「对比模式」→ 选择一个朝代 A 作为半透明幽灵层叠加在朝代 B 上
  - 点击疆域内任意位置 → 显示：府/道/路名称、隶属关系
  - 「古今地名对照」→ 点击古地名 → flyTo 现代对应位置 + 双向连接线

透明度控制：
  [▓▓▓▓▓▓▓░░░]  古疆域透明度调节
```

### 27.4 渲染

```
- 每个朝代一个 GeoJSON source，按时间轴显示/隐藏
- fill color = 朝代特色色（秦=黑, 汉=红, 唐=金, 宋=青, 明=蓝, 清=黄）
- fill-opacity = 0.25（半透明，不遮挡底图）
- 边界线 stroke = 2px 实线
- 古地名 label = 自定义 marker（小篆/繁体字体可选）

过渡动画：
  时间滑块变化时，上一帧的疆域粒子沿向量场漂移到下一帧位置
  实现：WebGL point cloud + CustomLayer（MapLibre 支持）
  或简化为：Canvas overlay + requestAnimationFrame
```

### 27.5 实现要点

```
- 疆域边界 TopoJSON 打包进 public/data/dynasties/
- 时间轴组件 = React 自定义（input[type=range] 样式化）
- 粒子过渡 = 可选，MVP 用简单的 opacity 淡入淡出
- 古今地名对照表 = JSON 映射文件（~500 条对应关系）
- 复用 v0.2 的 MapLibre fill + line layer 渲染管道
- 工具注册为 MapTool：'dynasty-overlay'
```

---

## 二十八、生态 & 生物多样性（v0.6）

### 28.1 概述

加载物种分布范围数据，在地图上可视化生物多样性热点、物种迁徙路线动画、IUCN 保护状态热力。

### 28.2 数据源

```
来源 1：IUCN Red List 空间数据 API
  https://api.iucnredlist.org/spatial/species/{id}
  → GeoJSON 分布多边形
  → 约 100,000+ 物种（爬行/鸟类/哺乳/两栖/鱼类/植物）

来源 2：GBIF (Global Biodiversity Information Facility)
  https://api.gbif.org/v1/occurrence/search?taxonKey=...
  → 物种观测点数据（含时间戳）
  → 可用于迁徙路径重建

来源 3：BirdLife International
  → 全球鸟类分布和迁徙路线

来源 4：内置精选数据集（为离线可用）
  → IUCN 濒危物种 Top 1000（< 10MB TopoJSON）
  → 代表性迁徙物种（北极燕鸥、帝王蝶、角马、座头鲸…）
```

### 28.3 功能

#### A. 物种分布热力

```
用户选择物种 / 类别（如"全部哺乳动物"）→ 叠加 IUCN 分布多边形
聚合策略：
  - 按 H3 六边形格网聚合物种数 → 生物多样性热力
  - 按保护状态分类着色：
    CR (极危) = 红色
    EN (濒危) = 橙色
    VU (易危) = 黄色
    NT (近危) = 浅绿
    LC (无危) = 绿色

交互：
  - 点击多边形 → 物种卡片（名称/分类/保护状态/图片）
  - 视口内物种列表（侧栏）
```

#### B. 迁徙路线动画

```
预定义迁徙走廊：
  ① 东亚-澳大利亚候鸟迁飞通道 (EAAF)
  ② 美洲中部迁飞通道
  ③ 非洲-欧洲迁飞通道

  ④ 北极燕鸥：北极 ↔ 南极（往返 70,000km）
  ⑤ 帝王蝶：加拿大 ↔ 墨西哥
  ⑥ 角马：塞伦盖蒂 ↔ 马赛马拉循环
  ⑦ 座头鲸：阿拉斯加 ↔ 夏威夷

动画：
  - 路径 = GeoJSON LineString
  - 沿路径移动的点 marker（代表个体/群体）
  - 点后拖尾（渐隐粒子）
  - 速度 = 模拟真实迁徙节奏（压缩时间轴）
  - 「季节轮」UI：四个季度切换 → 自动定位迁移阶段位置
```

#### C. IUCN 热力图

```
对当前视口范围内的濒危物种数做 KDE 热力 → 高亮保护热点
复用 v0.3 热力图管线（MapLibre heatmap layer）
```

### 28.4 交互

```
工具栏新增「🦜 生物多样性」按钮
激活后侧栏显示：
  ┌──────────────────────────┐
  │ 🐾 生态 & 生物多样性      │
  ├──────────────────────────┤
  │ 显示：                    │
  │ ☑ 物种分布多边形          │
  │ ☑ 保护状态着色            │
  │ ☐ 迁徙路线               │
  │ ☐ IUCN 热力              │
  ├──────────────────────────┤
  │ 筛选：                    │
  │ 分类: [全部 ▼]           │
  │ 保护: [CR+EN+VU ▼]       │
  │ 季节: [春季 ▼] (迁徙模式) │
  ├──────────────────────────┤
  │ ▶ 播放迁徙动画            │
  │ ◉ 速度: 100x             │
  └──────────────────────────┘
```

### 28.5 实现要点

```
- 物种分布多边形按需调用 IUCN API 或使用内置数据集
- 迁徙路线为预定义 GeoJSON + 时间戳数组
- 动画 = 沿 LineString 移点 marker（MapLibre animate + setLngLat）
- 拖尾 = 多个渐隐 marker 或 Canvas overlay
- H3 聚合 = 引入 h3-js（~40KB）做六边形格网分组
- 离线降级：内置精选物种 + 迁徙路线
```

---

## 二十九、山海经 & 文学地图框架（v0.6）

### 29.1 概述

构建通用的 `ILiteraryMapSource` 接口，允许任何文学作品/影视/游戏的世界地图
以插件形式注册到 PalmWorld。首发实现：**山海经**。

核心理念：**双空间耦合模型**——将虚拟世界的空间叙事锚定到真实地理坐标，
或者反之在真实地图上叠加幻想图层。

### 29.2 核心接口设计

```ts
// core/literary-map.ts

/** 锚点置信度 */
type AnchorConfidence = 'exact' | 'approximate' | 'conjectural' | 'mythical';

/** 文学锚点：连接虚构地点与真实坐标 */
interface LiteraryAnchor {
  id: string;
  name: string;                        // 原文名称，如 "昆仑之丘"
  nameZh?: string;                     // 中文名称
  description: string;                 // 原文描述片段
  category: 'mountain' | 'river' | 'lake' | 'country' | 'creature'
           | 'plant' | 'mineral' | 'character' | 'event' | 'route';

  // 地理锚定
  confidence: AnchorConfidence;
  realCoord?: [lng: number, lat: number];        // 真实经纬度 (EPSG:4326)
  realBbox?: [[number, number], [number, number]]; // 区域范围

  // 幻想坐标系（用于纯幻想地图渲染）
  fantasyCoord?: [x: number, y: number];         // 自定义坐标空间

  // 层级关系（如山属于某山脉、国属于某大荒）
  parentId?: string;

  // 附加媒体
  illustrationUrl?: string;           // 古籍插图（明清木刻扫描）
  aiGeneratedUrl?: string;            // AI 生成的现代渲染图
  audioUrl?: string;                  // 相关环境音/旁白
  model3dUrl?: string;               // 异兽 3D 模型 (.glb)

  // 用户交互
  relatedAnchors?: string[];          // 关联锚点 ID（如来龙去脉）
  travelRouteIds?: string[];          // 所属旅行路线 ID
}

/** 文学旅行路线 */
interface LiteraryRoute {
  id: string;
  name: string;                        // 如 "大禹治水", "夸父追日", "玄奘西行"
  anchorIds: string[];                 // 途经锚点 ID 序列
  startAnchorId: string;
  endAnchorId: string;
  description: string;
  animated?: boolean;                  // 是否支持动画回放
}

/** 文学地图源 */
interface ILiteraryMapSource {
  id: string;                          // 'shanhai-jing', 'journey-to-west'...
  title: string;                       // 显示名称 "山海经"
  subtitle?: string;
  era?: string;                        // 时代 "先秦"
  author?: string;
  description: string;

  // 视觉风格
  visualStyle: 'ancient-chinese' | 'medieval' | 'sci-fi' | 'modern'
             | 'ink-wash' | 'watercolor' | 'custom';

  // 核心数据
  anchors: LiteraryAnchor[];
  routes?: LiteraryRoute[];

  // 可选：自定义底图瓦片（幻想风格）
  baseTileUrl?: string;                // PMTiles 或 raster tileset
  baseTileAttribution?: string;

  // 可选：自定义 Canvas 叠加渲染
  overlayRenderer?: string;            // 渲染器 id，在 registry 中查找

  // 世界范围（用于纯幻想地图）
  worldBounds?: [[number, number], [number, number]];
}
```

### 29.3 双空间耦合架构

```
┌──────────────────────────────────────────────────────────┐
│                     PalmWorld                            │
│                                                          │
│  ┌──────────────────────┐   ┌──────────────────────────┐│
│  │   Reality Space       │   │   Fantasy Space           ││
│  │   (MapLibre)          │   │   (Custom Canvas /        ││
│  │   EPSG:3857           │   │    PMTiles 手绘底图)       ││
│  │                       │   │                           ││
│  │   卫星/地形/OSM 底图    │   │   山海经水墨底图           ││
│  │                       │   │   + d3-geo 自定义投影     ││
│  └──────────┬───────────┘   └──────────┬────────────────┘│
│             │                          │                  │
│             └──────────┬───────────────┘                  │
│                        │                                  │
│             ┌──────────▼──────────────┐                   │
│             │   Anchor Registry        │                   │
│             │   锚点映射表              │                   │
│             │                          │                   │
│             │   "昆仑之丘" ──→ [36.5,  │                   │
│             │                   79.2]  │                   │
│             │              ──→ fCoord  │                   │
│             │              (level 1)   │                   │
│             │                          │                   │
│             │   "青丘之国" ──→ fantasy │                   │
│             │                 only     │                   │
│             │              (level 4)   │                   │
│             └──────────────────────────┘                   │
│                                                          │
│  锚点映射策略（降级）：                                     │
│    Level 1 — 精确对应：直接有经纬度                          │
│              "泰山" → 36.25, 117.1                        │
│    Level 2 — 区域对应：有 bbox                            │
│              "昆仑" → 昆仑山脉范围                          │
│    Level 3 — 推测对应：根据文本推断大致区域                   │
│              "南次二经" → 浙江-福建一带                     │
│    Level 4 — 纯幻想：无现实对应 → 仅在幻想层渲染            │
│              "不死山", "黑齿国"                           │
└──────────────────────────────────────────────────────────┘
```

### 29.4 山海经 v1 实现计划

#### 数据策展

```
Phase 1：核心山脉 & 河流（~50 个锚点）
  ✅ 昆仑丘、昆仑虚 → 昆仑山脉
  ✅ 泰山、华山、衡山、恒山、嵩山 (五岳)
  ✅ 不周山 → 推测帕米尔高原
  ✅ 河（黄河）→ Yellow River
  ✅ 江（长江）→ Yangtze River
  ✅ 东海、南海、西海、北海

Phase 2：诸国 & 异域（~30 个锚点）
  青丘之国、黑齿国、羽民国、贯胸国、长臂国...
  大部分为 Level 4（纯幻想）

Phase 3：异兽数据库（~100 条）
  九尾狐、凤凰、应龙、穷奇、饕餮、梼杌、混沌...
  每条记录 = 原文引用 + 明清木刻插图 + AI 生成图
  异兽绑定到其所在地理锚点

Phase 4：神话路线（~5 条）
  大禹治水路线、夸父追日路线、后羿射日路线
  精卫填海、共工触山
```

#### 交互设计

```
「山海经模式」激活后：

┌─ 顶部切换条 ──────────────────────────────────┐
│  [现实底图] ←───●────→ [山海图]                │
│  透明度混合滑块                                  │
├─────────────────────────────────────────────────┤
│                                                 │
│          地图区域                                │
│    (根据滑块位置：纯现实 → 混合 → 纯幻想)        │
│                                                 │
│     ⋯⋯ 异兽图标散布 ⋯⋯                         │
│     🦊 九尾狐  🐉 应龙  🦅 凤凰                │
│                                                 │
│     🏔 昆仑之丘                                  │
│     🌊 东海                                     │
│                                                 │
├─ 底部信息栏 ───────────────────────────────────┤
│  点击异兽/地点 → 弹出卡片：                       │
│  ┌──────────────────────────┐                   │
│  │ [图]  九尾狐              │                   │
│  │ 《山海经·南山经》：        │                   │
│  │ "青丘之山有兽焉，          │                   │
│  │  其状如狐而九尾，          │                   │
│  │  其音如婴儿..."           │                   │
│  │ 📍 青丘之国 (仅存于传说)   │                   │
│  │ 🎨 [查看明清木刻图]        │                   │
│  │ 🤖 [查看 AI 渲染]         │                   │
│  │ 🔗 关联：大禹、涂山氏      │                   │
│  └──────────────────────────┘                   │
└─────────────────────────────────────────────────┘

侧栏功能：
  📖 按《山海经》十八卷目录浏览
  🗺 路线模式：沿大禹治水路线导航
  📸 "你在山海经的哪里" → GPS 定位 → 最近锚点
  🎒 收藏夹：已发现的异兽/地点
```

#### 底图美术方案

```
山海经风格底图选项：

方案 A：AI 生成 + 人工精修（推荐 MVP）
  1. 用 Midjourney/Stable Diffusion 生成水墨风世界地图
  2. 切片为 raster tiles (zoom 0-8)
  3. 部署为 PMTiles 文件

方案 B：程序化生成
  1. Canvas 实时渲染：地形高度 → 水墨皴法模拟
  2. 基于 DEM 数据做 stylized hillshade
  3. 叠加噪点纹理模拟宣纸质感

方案 C：社区协作
  1. 手绘风格 SVG 地图 + MapLibre 渲染
  2. 加载开源「山海经全图」矢量化版本

MVP 先用方案 A + B 混合：
  zoom 0-6: AI 生成瓦片（视觉震撼）
  zoom 7+: 程序化水墨 hillshade（无上限缩放）
```

### 29.5 实现文件结构

```
src/
├── core/
│   └── literary-map.ts              # ILiteraryMapSource + ILiteraryAnchor
│                                     #   + LiteraryMapRegistry
├── sources/
│   └── literary/
│       ├── registry.ts              # 文学图源注册表
│       ├── shanhai-jing.ts          # 山海经 ILiteraryMapSource 实现
│       │   ├── anchors/             # 锚点 JSON 数据分文件
│       │   │   ├── mountains.json   # 山脉锚点
│       │   │   ├── rivers.json      # 河流锚点
│       │   │   ├── countries.json   # 诸国锚点
│       │   │   ├── creatures.json   # 异兽数据
│       │   │   └── routes.json      # 神话路线
│       │   └── illustrations/       # 木刻插图 + AI 渲染
│       ├── journey-to-west/         # (未来) 西游记
│       └── lotr/                    # (未来) 指环王
│
├── tools/
│   └── literary-map.tool.ts         # MapTool 插件注册
│
├── components/
│   └── literary/
│       ├── LiteraryOverlay.tsx       # 文学地图叠加层（双空间同步）
│       ├── LiteraryPanel.tsx         # 侧栏控制面板
│       ├── AnchorCard.tsx            # 锚点详情卡片
│       ├── CreatureGallery.tsx       # 异兽图鉴画廊
│       ├── RouteAnimator.tsx         # 神话路线动画
│       └── FantasyCanvas.tsx         # 幻想图层 Canvas 渲染
│
└── workers/
    └── literary.worker.ts           # 文学数据预处理（可选）
```

### 29.6 扩展路线图

```
v0.6 — 山海经 v1
  ✅ 核心接口 ILiteraryMapSource
  ✅ 锚点系统（50 山脉/河流 + 30 国家 + 100 异兽）
  ✅ 双空间透明度混合
  ✅ 异兽图鉴 + 古籍原文

v0.7 — 文学地图「中国篇」
  🔲 西游记（长安→西天路线，81 难地点标记）
  🔲 三国演义（战场 + 势力范围时间轴）
  🔲 金庸武侠合集（门派位置 + 人物足迹）

v0.8 — 文学地图「全球篇」
  🔲 指环王（中土世界完整地图 + PMTiles 底图）
  🔲 冰与火之歌（维斯特洛 + 厄斯索斯）
  🔲 哈利波特（霍格沃茨及魔法世界）

v0.9 — 跨文化 & 游戏
  🔲 希腊神话（奥德赛航线）
  🔲 北欧神话（Yggdrasil 九界）
  🔲 原神（提瓦特大陆）
  🔲 塞尔达传说（海拉鲁）
```

### 29.7 技术风险评估

| 风险 | 缓解 |
|------|------|
| 山海经地名考据争议大 | 明确标注置信度等级，用户可提交修正 |
| AI 生成底图风格不稳定 | 预生成后人工筛选 + 程序化水墨 fallback |
| 古文数据录入工作量大 | 优先使用现成开源数据集 + LLM 辅助结构化 |
| PMTiles 底图文件大（>50MB） | 按需加载 + Service Worker 缓存 |
| 异兽 AI 图版权问题 | 使用 CC0 训练模型 + 标注生成工具和 prompt |

### 29.8 架构验证价值

和 v0.4 的 GeoGuessr / Choropleth 一样，文学地图框架是对系统可扩展性的又一次验证：
- 零侵入现有地图引擎
- ILiteraryMapSource 是纯数据接口 + 可选渲染钩子
- 所有文学内容作为独立数据文件，不依赖后端
- 框架设计确保后续作品只需提供 JSON 数据即可接入

---

## 附录 A：AI 功能架构预留说明

v0.5 AI 功能接入不会导致架构重构，原因如下：

```
现有接口已覆盖 AI 工具的完整数据流：

captureViewport()     → 截取地图画面 → 发送给 AI
addGeoJsonLayer()     → 渲染 AI 分析结果
removeLayer()         → 清除旧结果
getCenter/getZoom()   → 告诉 AI 当前视口范围

AI 工具 = 另一个 MapTool，不需要任何新抽象
```

三种 AI 接入路径对架构影响均为零：

| 路径 | 架构改动 | 纯静态 |
|------|---------|:---:|
| 外部 API + Serverless 代理 | 零（fetch 调 API） | ❌ 需 Serverless |
| WebLLM 浏览器推理 | 零（Worker 加载模型） | ✅ |
| 混血（小模型本地 + 大模型远程） | 零 | ⚠️ 部分 |

**唯一需要在 v0.1 确保的事：** `captureViewport()` 已在接口中定义，
MapLibre 适配器实现为 `map.getCanvas().toBlob()`（一行代码）。

---

> 本文档是活的，随项目演进而更新。所有核心决策记录在此，后续开发者（或 AI）第一时间读取本文件对齐认知。
