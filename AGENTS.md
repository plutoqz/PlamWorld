# PalmWorld

智能化解耦多功能 Web 地图应用。支持卫星影像/导航/地形多图源切换、3D 地形预留，纯静态部署。

## 项目

- **栈**: React 19 + TypeScript 6 + Vite 8 + MapLibre GL JS v6 + Zustand
- **入口**: `src/main.tsx` → `src/App.tsx` → `src/components/map/MapView.tsx`
- **完整规划**: `PROJECT_PLAN.md`（29 章节）
- **注意**: MapLibre v6 创建 Map 时**必须传 `style` 参数**，否则 `load` 事件永不触发

## 命令

```bash
npm run dev          # 开发服务器 (localhost:5173)
npm run build        # 生产构建 (tsc + vite)
npm run preview      # 预览构建产物
npm run lint         # oxlint src
npm run format       # Prettier
npm run test         # Vitest
npm run typecheck    # tsc --noEmit
```

## v0.1 — v0.3 已完成

- ✅ `IMapEngine` 接口 + `MapLibreAdapter` 适配器（完整实现）
- ✅ `ITileSource` 接口 + 多图源（ESRI 卫星 / OSM 导航 / OpenTopo 地形 / Google 卫星 / PMTiles）
- ✅ `MapView` + `SourceSwitcher` 图源一键切换
- ✅ 地图标准操作：缩放/旋转/倾斜
- ✅ `ToolRegistry` + 13 个工具全部实现

## v0.4 已完成

- ✅ **趣味地图生成 / Choropleth** (`tools/choropleth.tool.ts` + `core/choropleth.ts` + 4 组件)
  - CSV/JSON 上传 → 列映射 → fuse.js 模糊区域匹配 → Jenks/分位数/等间隔/连续分类
  - 14 内建 ColorBrewer 色阶方案（单色序/多色序/发散）
  - 区域匹配引擎（精确→别名→Levenshtein 三级）
- ✅ **地图投影实时切换** (`tools/projection-switch.tool.ts` + `ProjectionView` + `ProjectionPanel`)
  - d3-geo：Mercator ↔ Orthographic(地球仪) ↔ Equal Earth ↔ Robinson
  - 正交投影支持拖拽旋转（versor dragging）
  - Canvas 独立渲染，不侵入 MapLibre
- ✅ **阳光阴影模拟** (`tools/sunlight-shadow.tool.ts` + `SunlightControl`)
  - suncalc 太阳位置 + 时间轴滑块 + 日期选择器 + 播放动画
- ✅ **峰顶识别器** (`tools/peak-finder.tool.ts` + `PeakLabels`)
  - 30 内置世界山峰 + 点击视点 + 距离/方位计算 + 可见性判定
- ✅ **故事地图 / 叙事构建器** (`tools/story-map.tool.ts` + `StoryPlayer`)
  - 捕获视图快照 → 章节序列 → 自动播放 → JSON 导出/导入
- ✅ **GeoGuessr 趣味模式** (`tools/geoguessr.tool.ts` + `GeoGuessrPanel`)
  - 35 内置地点 + 三种模式（全球/中国/自然）+ 5000 分制计分
- ✅ **3D 建筑挤出** (`tools/3d-buildings.tool.ts`)
  - OSM 矢量瓦片 fill-extrusion + building:levels 高度

## v0.5 已完成

- ✅ **水文分析** (`tools/hydrology.tool.ts` + `core/hydrology.ts`)
  - D8 流向算法 → 填洼 → 流量累积 → 流域划分 → 地形湿度指数 (TWI)
  - Web Worker 计算，30m DEM 10km×10km ~110K 格网 < 2s
- ✅ **卫星图 AI 分析** (`tools/image-analysis.tool.ts`)
  - 建筑物轮廓识别 + 植被覆盖率
  - captureViewport() → AI API/WebLLM → addGeoJsonLayer() 渲染
- ✅ **智能地点摘要** (`tools/place-summary.tool.ts`)
  - 当前视口或选中地点生成自然语言摘要
- ✅ **自然语言地图搜索** (`tools/nl-search.tool.ts`)
  - 自然语言查询地点（如"北京附近适合徒步的山"）

## v0.6 已完成

详见 `PROJECT_PLAN.md` 第二十四至二十九节：
- ✅ **通视分析增强** — 多观察点合成 / 信号覆盖热力 / 雷达扇形 / 互视矩阵
- ✅ **路径规划 & 可视化** — A* / Dijkstra + 高程代价 / 等时线 (Isochrone)
- ✅ **地质剖面可视化** — 岩层结构剖面 / Macrostrat API / Canvas 双板渲染
- ✅ **古代疆域矢量叠加** — 多朝代疆域 Polygon 时间轴 / 朝代对比模式
- ✅ **生态 & 生物多样性** — 物种分布 / 迁徙路线动画 / IUCN 热力
- ✅ **山海经 & 文学地图框架** — ILiteraryMapSource 通用接口 / 双空间耦合渲染 / 山海经 v1

## 架构

```
src/
├── core/          # IMapEngine, ITileSource, MapTool, ToolRegistry, terrain, projection, choropleth, hydrology, pathfinding, geology, dynasty, ecology, literary-map
├── engines/       # MapLibreAdapter, elevation-api, sketch-overlay
├── sources/       # esri-satellite, osm-raster, open-topo, google-satellite, pmtiles, terrain-dem
│   └── literary/  # shanhai-jing — ILiteraryMapSource 山海经 v1 实现
├── stores/        # Zustand: mapStore, uiStore
├── components/    # MapView, SourceSwitcher, SearchBar, StatusBar, ToolSidebar, ToolPanel
│   ├── compare/   # CompareView (v0.2 双屏对比)
│   ├── terrain/   # ElevationProfile, ClimbStats, FloodLayer, SlopeAspect, Viewshed, Heatmap, EnhancedViewshedLayer, HydrologyLayer
│   ├── visual/    # ProjectionView, SunlightControl, PeakLabels, StoryPlayer, Choropleth 全家桶
│   ├── panels/    # FlyPanel, LayerImportPanel, TimeTravelPanel, ProjectionPanel, GeoGuessrPanel, HydrologyPanel, RoutePlannerPanel, GeologyPanel, DynastyPanel, EcologyPanel, LiteraryPanel
│   ├── literary/  # (v0.6) LiteraryOverlay, LiteraryPanel, AnchorCard, CreatureGallery, RouteAnimator, FantasyCanvas
│   ├── true-size/ # TrueSizePanel (v0.3)
│   └── ui/        # 通用 UI 组件
├── tools/         # 30 个 MapTool 插件 (v0.1—v0.6 全覆盖)
├── hooks/         # useMap, useMapSource, useGeolocation
├── workers/       # geo.worker + worker-bridge
└── data/          # Natural Earth 边界数据 + dynasties/ 疆域 + species/ 物种
```

**核心设计**: `IMapEngine` 覆盖核心操作 + `getNative()` 泄漏底层。`ToolRegistry` 插件注册。

## 约定

- **TS strict** — `verbatimModuleSyntax` + `erasableSyntaxOnly`
- **Vite 别名**: `@core/*`, `@engines/*`, `@sources/*`, `@stores/*`, `@components/*` 等
- **MapLibre 导入**: `import * as maplibregl from 'maplibre-gl'`（v6 无默认导出）
- **GeoJSON 类型**: 从 `geojson` 包导入（TS6 不再自动识别全局命名空间）
- **MapLibre v6 坑**: `new Map()` 必传 `style`，否则 load 事件不触发
- **React 开发模式**: 已去 StrictMode（double-mount 对 MapLibre 致命）

## 备注

- 默认图源 ESRI 卫星影像，通过 `sourceRegistry` 管理
- v0.4 全线完工：17 个 MapTool 插件（v0.1 搜索/定位 → v0.2 测量/剖线/海平面/对比 → v0.3 通视/坡度/真实大小/热力/图层导入/时空/飞行 → v0.4 Choropleth/投影/阳光/峰顶/故事/GeoGuessr/3D建筑）
- v0.5 全线完工：4 个新增工具（水文分析 / 卫星图 AI 分析 / 智能地点摘要 / 自然语言搜索）→ 累计 24 个 MapTool
- 新增依赖：papaparse / fuse.js / simple-statistics / d3-geo / d3-scale-chromatic / suncalc
- 引擎引用挂 `window.__engine` 供快速调试
- v0.6 已完成：6/6 功能全部实现，工具总数 30 个，编译零错误，构建成功
