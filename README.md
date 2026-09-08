<p align="center">
  <img src="./palmworld-mobile.png" alt="PalmWorld" width="96" />
</p>

<h1 align="center">🌴 PalmWorld</h1>
<p align="center">
  <strong>智能化解耦多功能 Web 地图应用</strong><br/>
  卫星影像 · 3D 地形 · 空间分析 · 趣味可视化 · 文学地图 · 纯静态部署
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript" alt="TypeScript 6" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite" alt="Vite 8" />
  <img src="https://img.shields.io/badge/MapLibre-v6-3766A2?logo=maplibre" alt="MapLibre GL JS v6" />
  <img src="https://img.shields.io/badge/Zustand-5-59431f" alt="Zustand 5" />
  <img src="https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss" alt="Tailwind 4" />
  <img src="https://img.shields.io/badge/Tools-30-22c55e" alt="30 tools" />
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License" />
</p>

<p align="center">
  <img src="./palmworld-desktop.png" alt="PalmWorld 桌面端效果预览" width="880" />
</p>

---

## ✨ 功能一览

<table>
<tr>
<td width="50%">

### 🗺️ 核心地图 (v0.1)
- **6 大图源一键切换**（Google 卫星(默认) / ESRI 卫星 / OSM 导航 / OSM Liberty 矢量 / OpenTopo 地形 / PMTiles 本地瓦片）
- 3D 地形渲染（MapLibre Terrain3D）
- 地名搜索 + 飞行动画定位
- GPS 定位（浏览器 Geolocation）
- 缩放 / 旋转 / 倾斜 / 指南针复位

### 📐 测量 & 对比 (v0.2)
- 双屏 / 滑动帘对比模式
- 距离 & 面积测量
- **地形剖线** — 沿路径提取 DEM 高程，Canvas 交互式剖面图
- **累计爬升/下降** — 难度评级（平缓→极限）
- **海平面上升模拟** — 交互式水位滑块 + DEM 实时淹没

</td>
<td width="50%">

### 🔭 空间分析 (v0.3)
- **通视分析** — 360° 射线追踪 + horizon line 算法
- **坡度/坡向分析** — DEM 梯度卷积 → 色阶图
- **真实大小比较** — 拖动行政区幽灵图层，实时 Mercator 校正
- **基础热力图** — KDE 核密度估计，turf.js + Worker
- **自定义图层导入** — GeoJSON / GPX / KML 解析
- **时空穿梭** — 多年份卫星影像对比
- **3D 飞行漫游**

### 🎨 趣味可视化 (v0.4)
- **Choropleth 专题地图** — CSV/JSON → 模糊区域匹配 → 14 种 ColorBrewer 色阶
- **地图投影切换** — Mercator ↔ Globe ↔ Equal Earth ↔ Robinson
- **阳光阴影模拟** — suncalc 太阳位置 + 时间轴动画
- **峰顶识别器** — 30 内置世界山峰 + 可见性判定
- **故事地图** — 视图快照 → 章节序列 → 自动播放 → JSON 导出
- **GeoGuessr 模式** — 35 内置地点 + 三种模式 + 5000 分制
- **3D 建筑挤出** — OSM fill-extrusion + 楼层高度

</td>
</tr>
<tr>
<td width="50%">

### 🧠 智能分析 (v0.5)
- **水文分析** — D8 流向 → 填洼 → 流量累积 → 流域划分 → 地形湿度指数 (TWI)
- **卫星图分析** — 纯前端视口影像色彩像素分类（植被/水体/建筑覆盖率）
- **智能地点摘要** — 任意选点逆地理编码 + 周边 POI 聚合自然语言摘要
- **自然语言搜索** — 中文意图解析 + 附近 POI 空间检索（"台北最高的山"、"故宫附近公园"）

</td>
<td width="50%">

### 🧩 进阶分析 & 文学地图 (v0.6)
- **增强通视** — 多观察点合成 / 信号覆盖热力 / 雷达扇形 / 互视矩阵
- **路径规划** — A* / Dijkstra + 高程代价 + 等时线圈 (Isochrone)
- **地质剖面** — 岩层结构 + Macrostrat API + Canvas 双板渲染
- **古代疆域** — 秦汉唐宋元明清 Polygon 时间轴 + 朝代对比模式
- **生态 & 生物多样性** — 物种分布 / 迁徙路线动画 / IUCN 热力
- **山海经文学地图** — 双空间耦合渲染 / 36 个神话地理锚点 / 异兽图鉴画廊

</td>
</tr>
</table>

---

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 18
- **npm** ≥ 9

### 安装 & 运行

```bash
# 克隆仓库
git clone https://github.com/plutoqz/PlamWorld.git
cd PlamWorld

# 安装依赖
npm install

# 启动开发服务器
npm run dev        # → http://localhost:5173

# 生产构建
npm run build      # tsc -b && vite build

# 预览构建产物
npm run preview
```

### 所有命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 (localhost:5173) |
| `npm run build` | 生产构建 (tsc -b && vite build) |
| `npm run preview` | 预览构建产物 |
| `npm run lint` | oxlint 代码检查 |
| `npm run format` | Prettier 格式化 |
| `npm run test` | Vitest 单元测试 |
| `npm run typecheck` | TypeScript 类型检查 |

---

## 🏗️ 架构设计

### 核心设计原则

| 原则 | 说明 |
|------|------|
| **解耦优先** | 地图引擎、图源、工具均通过接口抽象，互不直接依赖 |
| **渐进增强** | MVP 最小可用，架构预留扩展点，功能按插件接入 |
| **类型安全** | TypeScript strict mode，全量类型覆盖 |
| **纯静态可部署** | 无后端依赖，所有数据走公开 API / 静态瓦片服务 / 浏览器端运算 |
| **性能优先** | Web Worker 处理计算密集任务，主线程专注渲染 |

### 抽象层次

```
┌─────────────────────────────────────────────────────────────┐
│                        ToolRegistry                         │  ← 30 个 MapTool 插件
│        search │ measure │ viewshed │ choropleth…             │
├──────────────────────────────┬──────────────────────────────┤
│    IMapEngine (核心接口)      │    ITileSource (图源接口)     │
├──────────────────────────────┼──────────────────────────────┤
│   MapLibreAdapter            │  google-satellite (默认)      │
│   elevation-api              │  esri-satellite              │
│   sketch-overlay             │  osm-raster                  │
│   building-extrusion         │  osm-liberty                 │
│   geojson-canvas             │  open-topo                   │
│                              │  pmtiles                     │
│                              │  terrain-dem                 │
│                              │  literary/shanhai-jing       │
├──────────────────────────────┴──────────────────────────────┤
│                 MapLibre GL JS v6 (渲染引擎)                  │
├─────────────────────────────────────────────────────────────┤
│                   React 19 + Zustand (UI 层)                 │
└─────────────────────────────────────────────────────────────┘
```

**核心设计**: `IMapEngine` 接口覆盖所有地图核心操作 + `getNative()` 暴露底层原生能力。`ToolRegistry` 实现插件化注册与生命周期管理，任何工具只需实现 `MapTool` 接口即可接入。

---

## 📁 项目结构

```
src/
├── core/              # 核心抽象层与数据算法
│   ├── engine.ts      #   IMapEngine 接口定义
│   ├── source.ts      #   ITileSource 接口定义
│   ├── tools.ts       #   MapTool 接口 + ToolRegistry
│   ├── terrain.ts     #   地形分析核心算法
│   ├── choropleth.ts  #   专题地图数据引擎
│   ├── projection.ts  #   投影计算 (d3-geo)
│   ├── hydrology.ts   #   水文分析 (D8 算法)
│   ├── pathfinding.ts #   路径规划 (A*/Dijkstra)
│   ├── geology.ts     #   地质剖面引擎
│   ├── dynasty.ts     #   古代疆域数据引擎 (含内置朝代 Polygon)
│   ├── ecology.ts     #   生态物种数据引擎 (含内置物种分布/迁徙)
│   ├── literary-map.ts#   文学地图通用接口
│   ├── geocode.ts     #   地理编码与逆地理分析
│   └── types.ts       #   全局类型定义
│
├── engines/           # 引擎适配器
│   ├── maplibre/      #   MapLibreAdapter + 覆盖层扩展
│   └── elevation-api.ts
│
├── sources/           # 图源实现
│   ├── registry.ts    #   图源注册中心
│   ├── google-satellite.ts # 默认 Google 卫星影像
│   ├── esri-satellite.ts   # ESRI World Imagery
│   ├── osm-raster.ts       # OpenStreetMap 栅格
│   ├── osm-liberty.ts      # OSM Liberty 矢量地图
│   ├── open-topo.ts        # OpenTopoMap 地形
│   ├── pmtiles.ts          # 本地/单文件矢量瓦片
│   ├── terrain-dem.ts      # Terrain-RGB 瓦片源
│   └── literary/          # 文学地图数据源 (山海经等)
│
├── tools/             # 30 个 MapTool 插件
│   ├── registry.ts    #   工具注册中心 (全量注册)
│   ├── search.tool.ts
│   ├── measure.tool.ts
│   ├── viewshed.tool.ts
│   ├── choropleth.tool.ts
│   ├── geoguessr.tool.ts
│   ├── route-planner.tool.ts
│   ├── geology-profile.tool.ts
│   ├── dynasty-overlay.tool.ts
│   ├── ecology.tool.ts
│   ├── literary-map.tool.ts
│   └── ... (共 30 个)
│
├── components/        # React UI 组件
│   ├── map/           #   MapView 核心地图组件
│   ├── controls/      #   SearchBar, SourceSwitcher, ToolSidebar, StatusBar
│   ├── compare/       #   CompareView (双屏/卷帘对比)
│   ├── terrain/       #   地形/水文/通视可视化组件
│   ├── visual/        #   趣味/专题可视化组件 (Choropleth/投影/峰顶等)
│   ├── panels/        #   各工具参数与交互面板
│   ├── true-size/     #   真实大小比较组件
│   └── ui/            #   通用 UI 组件与图标
│
├── stores/            # Zustand 状态管理
│   ├── mapStore.ts
│   └── uiStore.ts
│
├── hooks/             # React Hooks
│   ├── useMap.ts
│   ├── useMapSource.ts
│   └── useGeolocation.ts
│
├── workers/           # Web Worker
│   ├── geo.worker.ts
│   └── worker-bridge.ts
│
└── data/              # 静态数据资源
    ├── boundaries/    #   Natural Earth 基础边界
    └── firenze.json   #   3D 建筑演示数据
```

---

## 🛠️ 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **UI 框架** | React 19 | 函数组件 + Hooks |
| **类型系统** | TypeScript 6 | Strict mode + `verbatimModuleSyntax` |
| **构建工具** | Vite 8 | 极速 HMR + 生产构建 |
| **地图引擎** | MapLibre GL JS v6 | WebGL 渲染，3D 地形 |
| **状态管理** | Zustand 5 | 轻量响应式状态 |
| **样式方案** | Tailwind CSS 4 | 原子化 Utility-First |
| **空间分析** | Turf.js 7 | 地理空间计算 |
| **数据统计** | simple-statistics 7 | Jenks 自然断点 / 分位数分级 |
| **投影计算** | d3-geo | 多投影变换与旋转渲染 |
| **格式解析** | PapaParse 5 / @tmcw/togeojson | CSV / GPX / KML 客户端解析 |
| **模糊搜索** | Fuse.js 7 | 区域名称模糊匹配 |
| **天文计算** | suncalc | 太阳轨迹与日照计算 |
| **离线瓦片** | PMTiles 4 | 单文件矢量/栅格瓦片切片规范 |
| **图标体系** | Lucide React | 现代 SVG 图标 |
| **质量保证** | Vitest 4 + oxlint | 单元测试与极速静态检查 |

---

## 📝 开发约定

- **TS strict** — `verbatimModuleSyntax` + `erasableSyntaxOnly`
- **Vite 别名**: `@core/*` `@engines/*` `@sources/*` `@stores/*` `@components/*` `@tools/*` `@hooks/*` `@workers/*` `@data/*`
- **MapLibre 导入**: `import * as maplibregl from 'maplibre-gl'`（v6 无默认导出）
- **GeoJSON 类型**: 从 `geojson` 包导入（TS6 不再自动识别全局命名空间）
- **MapLibre v6 注意**: `new Map()` 必须传 `style` 参数，否则 `load` 事件不触发
- **React 开发模式**: 已去 StrictMode（double-mount 对 MapLibre 致命）
- **调试**: `window.__engine` 暴露引擎引用供 DevTools 快速调试

---

## 🗺️ 30 个工具插件一览

| # | 工具 ID | 工具名称 | 分类 | 版本 | 描述 |
|---|---------|----------|------|------|------|
| 1 | `search` | 搜索定位 | navigation | v0.1 | 地名搜索 + 飞行动画定位 |
| 2 | `locate` | GPS 定位 | navigation | v0.1 | 浏览器 GPS 定位 |
| 3 | `measure` | 距离/面积测量 | measurement | v0.2 | 交互式折线测距与多边形测面 |
| 4 | `profile` | 地形剖线 | measurement | v0.2 | 地形剖线提取 + 爬升/下降与难度评级 |
| 5 | `sea-level` | 海平面上升 | simulation | v0.2 | 交互式水位滑块 + DEM 实时淹没模拟 |
| 6 | `compare` | 图源对比 | comparison | v0.2 | 双屏并排 / 滑动卷帘对比 |
| 7 | `viewshed` | 通视分析 | measurement | v0.3 | 360° 射线追踪 + horizon line 算法 |
| 8 | `slope-aspect` | 坡度/坡向 | measurement | v0.3 | DEM 梯度卷积 → 坡度色阶与坡向分类图 |
| 9 | `true-size` | 真实大小 | comparison | v0.3 | 拖动行政区幽灵图层，校正 Mercator 面积失真 |
| 10 | `heatmap` | 热力图 | visualization | v0.3 | 核密度估计 (KDE) 空间点热力分布 |
| 11 | `layer-import` | 图层导入 | visualization | v0.3 | GeoJSON / GPX / KML 拖拽导入与样式渲染 |
| 12 | `time-travel` | 时空穿梭 | comparison | v0.3 | 多年份卫星历史影像对比 |
| 13 | `fly` | 3D 飞行 | simulation | v0.3 | 航线设定 + 3D 第一人称飞行漫游 |
| 14 | `choropleth` | 趣味地图生成 | visualization | v0.4 | CSV/JSON 上传 → 模糊区划匹配 → 14 种色阶分级 |
| 15 | `projection-switch` | 地图投影切换 | visualization | v0.4 | Mercator ↔ Globe ↔ Equal Earth ↔ Robinson 实时投影 |
| 16 | `sunlight-shadow` | 阳光阴影模拟 | simulation | v0.4 | suncalc 太阳位置 + 时间轴动态光照模拟 |
| 17 | `peak-finder` | 峰顶识别器 | navigation | v0.4 | 点击视点识别视野内可见山峰、高度与方位 |
| 18 | `story-map` | 故事地图 | story | v0.4 | 视图快照 → 章节序列编排 → 自动漫游回放 |
| 19 | `geoguessr` | GeoGuessr 趣味模式 | story | v0.4 | 全球/中国/自然随机地点猜猜看 (5000 分制) |
| 20 | `3d-buildings` | 3D 建筑挤出 | visualization | v0.4 | OSM 建筑足迹 3D fill-extrusion 挤出渲染 |
| 21 | `hydrology` | 水文分析 | measurement | v0.5 | D8 流向 → 填洼 → 流量累积 → 流域划分 → TWI |
| 22 | `image-analysis` | 卫星图分析 | visualization | v0.5 | 视口卫星影像色彩像元分类（植被/水体/建筑占比） |
| 23 | `place-summary` | 智能地点摘要 | navigation | v0.5 | 任意选点逆地理编码 + POI 聚合与自然语言摘要 |
| 24 | `nl-search` | 自然语言搜索 | navigation | v0.5 | 中文意图解析 + 附近 POI 空间检索 |
| 25 | `enhanced-viewshed` | 增强通视分析 | measurement | v0.6 | 多观察点合成 / 信号覆盖热力 / 雷达扇形 / 互视矩阵 |
| 26 | `route-planner` | 路径规划 | navigation | v0.6 | A* / Dijkstra + 高程惩罚代价 + 等时线圈 |
| 27 | `geology-profile` | 地质剖面 | visualization | v0.6 | 岩层结构剖面 + Macrostrat API + Canvas 双板渲染 |
| 28 | `dynasty-overlay` | 古代疆域 | comparison | v0.6 | 秦汉唐宋元明清多朝代疆域时间轴与对比模式 |
| 29 | `ecology` | 生物多样性 | visualization | v0.6 | 精选物种分布范围 / 迁徙路线动画 / IUCN 保护状态 |
| 30 | `literary-map` | 文学地图 | story | v0.6 | 山海经双空间耦合渲染 / 36 个神话地理锚点 / 异兽图鉴 |

---

## 📄 License

MIT © [PalmWorld](https://github.com/plutoqz/PlamWorld)

---

<p align="center">
  <sub>Built with ❤️ using React · TypeScript · MapLibre GL JS</sub>
</p>
