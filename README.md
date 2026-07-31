<p align="center">
  <img src="https://raw.githubusercontent.com/plutoqz/PlamWorld/master/palmworld-mobile.png" alt="PalmWorld" width="96" />
</p>

<h1 align="center">🌴 PalmWorld</h1>
<p align="center">
  <strong>智能化解耦多功能 Web 地图应用</strong><br/>
  卫星影像 · 3D 地形 · 空间分析 · 趣味可视化 · 纯静态部署
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

---

## ✨ 功能一览

<table>
<tr>
<td width="50%">

### 🗺️ 核心地图 (v0.1)
- 多图源一键切换（ESRI 卫星 / OSM 导航 / OpenTopo 地形 / Google 卫星 / PMTiles）
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
- **自定义图层导入** — GeoJSON / GPX / KML
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

### 🧠 AI & 智能 (v0.5)
- **水文分析** — D8 流向 → 填洼 → 流量累积 → 流域划分 → TWI
- **卫星图 AI 分析** — 建筑物轮廓识别 + 植被覆盖率
- **智能地点摘要** — 视口自然语言描述
- **自然语言搜索** — "北京附近适合徒步的山"

</td>
<td width="50%">

### 🧩 进阶分析 (v0.6)
- **增强通视** — 多观察点合成 / 雷达扇形 / 互视矩阵
- **路径规划** — A\* / Dijkstra + 高程代价 + 等时线
- **地质剖面** — 岩层结构 + Macrostrat API + Canvas 双板渲染
- **古代疆域** — 多朝代 Polygon 时间轴 + 对比模式
- **生态 & 生物多样性** — 物种分布 / 迁徙动画 / IUCN 热力
- **山海经文学地图** — 双空间耦合渲染 / 异兽图鉴

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
npm run build      # tsc + vite build

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
| **纯静态可部署** | 无后端依赖，所有数据走公开 API / 静态瓦片服务 |
| **性能优先** | Web Worker 处理计算密集任务，主线程专注渲染 |

### 抽象层次

```
┌─────────────────────────────────────────────────┐
│                    ToolRegistry                  │  ← 30 个 MapTool 插件
│     search │ measure │ viewshed │ choropleth…    │
├─────────────────────────────────────────────────┤
│  IMapEngine (核心接口)  │  ITileSource (图源接口)   │
├────────────────────────┼─────────────────────────┤
│   MapLibreAdapter       │  esri-satellite         │
│   elevation-api         │  osm-raster             │
│   sketch-overlay        │  open-topo              │
│   building-extrusion    │  google-satellite        │
│   geojson-canvas        │  pmtiles                │
│                         │  terrain-dem            │
│                         │  literary/shanhai-jing  │
├────────────────────────┴─────────────────────────┤
│           MapLibre GL JS v6 (渲染引擎)             │
├─────────────────────────────────────────────────┤
│         React 19 + Zustand (UI 层)                │
└─────────────────────────────────────────────────┘
```

**核心设计**: `IMapEngine` 接口覆盖所有地图核心操作 + `getNative()` 泄漏底层能力。`ToolRegistry` 实现插件化注册与激活，任何工具只需实现 `MapTool` 接口即可接入。

---

## 📁 项目结构

```
src/
├── core/              # 核心抽象层
│   ├── engine.ts      #   IMapEngine 接口定义
│   ├── source.ts      #   ITileSource 接口定义
│   ├── tools.ts       #   MapTool 接口 + ToolRegistry
│   ├── terrain.ts     #   地形分析核心算法
│   ├── choropleth.ts  #   专题地图数据引擎
│   ├── projection.ts  #   投影计算 (d3-geo)
│   ├── hydrology.ts   #   水文分析 (D8 算法)
│   ├── pathfinding.ts #   路径规划 (A*/Dijkstra)
│   ├── geology.ts     #   地质剖面引擎
│   ├── dynasty.ts     #   古代疆域数据引擎
│   ├── ecology.ts     #   生态物种数据引擎
│   ├── literary-map.ts#   文学地图通用接口
│   ├── geocode.ts     #   地理编码
│   └── types.ts       #   全局类型定义
│
├── engines/           # 引擎适配器
│   ├── maplibre/      #   MapLibreAdapter + overlay
│   └── elevation-api.ts
│
├── sources/           # 图源实现
│   ├── registry.ts    #   图源注册中心
│   ├── esri-satellite.ts
│   ├── osm-raster.ts
│   ├── open-topo.ts
│   ├── google-satellite.ts
│   ├── pmtiles.ts
│   ├── terrain-dem.ts
│   └── literary/      #   文学地图数据源
│
├── tools/             # 30 个 MapTool 插件
│   ├── registry.ts    #   工具注册中心
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
│   ├── controls/      #   SearchBar, SourceSwitcher, ToolSidebar
│   ├── terrain/       #   地形分析可视化组件
│   ├── visual/        #   趣味可视化组件
│   ├── panels/        #   各工具面板
│   └── ui/            #   通用 UI 组件
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
└── data/              # 静态数据
    ├── boundaries/    #   Natural Earth 边界
    ├── dynasties/     #   朝代疆域
    └── species/       #   物种分布
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
| **投影计算** | d3-geo | 多投影切换 |
| **模糊搜索** | Fuse.js 7 | 区域名称模糊匹配 |
| **数据解析** | PapaParse 5 | CSV 解析 |
| **天文计算** | suncalc | 太阳位置计算 |
| **地形瓦片** | PMTiles 4 | 单文件矢量瓦片 |
| **图标** | Lucide React | 现代 SVG 图标 |

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

| # | 工具 | 版本 | 描述 |
|---|------|------|------|
| 1 | `search` | v0.1 | 地名搜索 + 飞行动画定位 |
| 2 | `locate` | v0.1 | 浏览器 GPS 定位 |
| 3 | `measure` | v0.2 | 距离 + 面积测量 |
| 4 | `elevation-profile` | v0.2 | 地形剖线 + 爬升统计 |
| 5 | `sea-level-rise` | v0.2 | 海平面上升淹没模拟 |
| 6 | `compare` | v0.2 | 双屏/滑动帘对比 |
| 7 | `viewshed` | v0.3 | 通视分析 |
| 8 | `slope-aspect` | v0.3 | 坡度/坡向分析 |
| 9 | `true-size` | v0.3 | 真实大小比较 |
| 10 | `heatmap` | v0.3 | 核密度热力图 |
| 11 | `layer-import` | v0.3 | GeoJSON/GPX/KML 导入 |
| 12 | `time-travel` | v0.3 | 时空穿梭影像对比 |
| 13 | `fly` | v0.3 | 3D 飞行漫游 |
| 14 | `choropleth` | v0.4 | 专题地图生成 |
| 15 | `projection-switch` | v0.4 | 地图投影实时切换 |
| 16 | `sunlight-shadow` | v0.4 | 阳光阴影模拟 |
| 17 | `peak-finder` | v0.4 | 峰顶识别器 |
| 18 | `story-map` | v0.4 | 故事地图叙事构建 |
| 19 | `geoguessr` | v0.4 | GeoGuessr 趣味模式 |
| 20 | `3d-buildings` | v0.4 | 3D 建筑挤出 |
| 21 | `hydrology` | v0.5 | 水文分析 (D8) |
| 22 | `image-analysis` | v0.5 | 卫星图 AI 分析 |
| 23 | `place-summary` | v0.5 | 智能地点摘要 |
| 24 | `nl-search` | v0.5 | 自然语言地图搜索 |
| 25 | `enhanced-viewshed` | v0.6 | 增强通视分析 |
| 26 | `route-planner` | v0.6 | 路径规划 & 等时线 |
| 27 | `geology-profile` | v0.6 | 地质剖面可视化 |
| 28 | `dynasty-overlay` | v0.6 | 古代疆域叠加 |
| 29 | `ecology` | v0.6 | 生态 & 生物多样性 |
| 30 | `literary-map` | v0.6 | 山海经文学地图 |

---

## 📄 License

MIT © [PalmWorld](https://github.com/plutoqz/PlamWorld)

---

<p align="center">
  <sub>Built with ❤️ using React · TypeScript · MapLibre GL JS</sub>
</p>
