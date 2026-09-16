// tools/admin-boundary.tool.ts — 行政区图层工具 (MapTool 升级版)
//
// 提供全球主权国家边界 (ADM0)、中国省级 (ADM1)、地市级 (ADM2)、区县级 (ADM3)
// 以及国际主要大都市区的多层级下钻、边界矢量渲染与属性卡片检索。

import type { MapTool, ToolContext } from '../core/tools';
import type { AdminRegion } from '../core/admin-boundary';
import {
  getChinaProvinces,
  getWorldCountries,
  getGlobalMajorCities,
  searchAdminRegions,
  fetchSubdivisions,
  getCombinedBoundariesGeoJson,
} from '../core/admin-boundary';
import chinaAdminTreeData from '../data/boundaries/china-admin-tree.json';

export interface BreadcrumbItem {
  name: string;
  adcode?: string;
  region?: AdminRegion;
}

export interface AdminBoundaryState {
  showCountries: boolean;
  showProvinces: boolean;
  showGlobalCities: boolean;
  fillMode: 'outline' | 'soft-fill';
  showLabels: boolean;
  borderColor: string;
  borderWidth: number;
  fillOpacity: number;
  selectedRegion: AdminRegion | null;
  activeSubdivisions: AdminRegion[];
  breadcrumbs: BreadcrumbItem[];
  searchKeyword: string;
  loadingSubdivisions: boolean;
}

const DEFAULT_STATE: AdminBoundaryState = {
  showCountries: true,
  showProvinces: true,
  showGlobalCities: true,
  fillMode: 'outline',
  showLabels: true,
  borderColor: '#38c49b',
  borderWidth: 1.5,
  fillOpacity: 0.25,
  selectedRegion: null,
  activeSubdivisions: [],
  breadcrumbs: [{ name: '全国 / 全球' }],
  searchKeyword: '',
  loadingSubdivisions: false,
};

export class AdminBoundaryTool implements MapTool {
  readonly id = 'admin-boundary';
  readonly name = '行政区图层';
  readonly icon = 'LandPlot';
  readonly category = 'visualization' as const;
  readonly description = '国界/省界/市级/县级与国际大都市多层级下钻图层';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  state: AdminBoundaryState = { ...DEFAULT_STATE };
  private onStateChange: (() => void) | null = null;

  get engine() {
    return this.ctx?.engine ?? null;
  }

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  private notify(): void {
    this.onStateChange?.();
  }

  // ---- setters ----

  setShowCountries(val: boolean): void {
    this.state.showCountries = val;
    this.notify();
  }

  setShowProvinces(val: boolean): void {
    this.state.showProvinces = val;
    this.notify();
  }

  setShowGlobalCities(val: boolean): void {
    this.state.showGlobalCities = val;
    this.notify();
  }

  setFillMode(mode: 'outline' | 'soft-fill'): void {
    this.state.fillMode = mode;
    this.notify();
  }

  setShowLabels(val: boolean): void {
    this.state.showLabels = val;
    this.notify();
  }

  setBorderColor(color: string): void {
    this.state.borderColor = color;
    this.notify();
  }

  setBorderWidth(width: number): void {
    this.state.borderWidth = Math.max(0.5, Math.min(6, width));
    this.notify();
  }

  setFillOpacity(opacity: number): void {
    this.state.fillOpacity = Math.max(0, Math.min(1, opacity));
    this.notify();
  }

  setSelectedRegion(region: AdminRegion | null): void {
    this.state.selectedRegion = region;
    this.notify();
  }

  setSearchKeyword(keyword: string): void {
    this.state.searchKeyword = keyword;
    this.notify();
  }

  // ---- 下钻与面包屑 ----

  /**
   * 点击省份、地级市或县级行政区进行向下钻取或定位
   * 采用基于行政区层级与血缘链（Ancestry Chain）重构面包屑，
   * 彻底避免不同省份或同级行政区之间发生路径无限追加与拼接问题。
   */
  async drillDown(region: AdminRegion): Promise<void> {
    if (region.level === 'global-city' || region.level === 'country') {
      this.state.selectedRegion = region;
      this.state.breadcrumbs = [
        { name: '全国 / 全球' },
        { name: region.nameZh, adcode: region.code, region },
      ];
      this.state.activeSubdivisions = [];
      this.notify();
      return;
    }

    const allProvs = this.getAllProvinces();

    // 1. 省级下钻
    if (region.level === 'province') {
      this.state.selectedRegion = region;
      this.state.loadingSubdivisions = true;
      // 省级直接重置面包屑为：[全国 / 全球, 该省]，杜绝多省拼接
      this.state.breadcrumbs = [
        { name: '全国 / 全球' },
        { name: region.nameZh, adcode: region.code, region },
      ];
      this.notify();

      const subs = await fetchSubdivisions(region.code);
      this.state.activeSubdivisions = subs;
      this.state.loadingSubdivisions = false;
      this.notify();
      return;
    }

    // 2. 地市级下钻
    if (region.level === 'city') {
      this.state.selectedRegion = region;
      this.state.loadingSubdivisions = true;

      // 寻找所属父级省份
      const provCode = region.code.length >= 2 ? `${region.code.slice(0, 2)}0000` : '';
      const parentProv = allProvs.find(
        (p) => p.code === provCode || p.nameZh === region.parentName,
      );

      // 地市级面包屑重置为：[全国 / 全球, 所属省, 该市]，杜绝跨省或同省兄弟地市累加
      const nextCrumbs: BreadcrumbItem[] = [{ name: '全国 / 全球' }];
      if (parentProv) {
        nextCrumbs.push({
          name: parentProv.nameZh,
          adcode: parentProv.code,
          region: parentProv,
        });
      }
      nextCrumbs.push({
        name: region.nameZh,
        adcode: region.code,
        region,
      });

      this.state.breadcrumbs = nextCrumbs;
      this.notify();

      const subs = await fetchSubdivisions(region.code);
      this.state.activeSubdivisions = subs;
      this.state.loadingSubdivisions = false;
      this.notify();
      return;
    }

    // 3. 区县级下钻
    if (region.level === 'county') {
      this.state.selectedRegion = region;
      this.state.loadingSubdivisions = true;

      // 寻找所属省份
      const provCode = region.code.length >= 2 ? `${region.code.slice(0, 2)}0000` : '';
      const parentProv = allProvs.find(
        (p) => p.code === provCode || p.nameZh === region.parentName,
      );

      const treeData = chinaAdminTreeData as unknown as {
        flatIndex: { adcode: string; name: string; level: string; center: [number, number]; parentName?: string }[];
      };

      const nextCrumbs: BreadcrumbItem[] = [{ name: '全国 / 全球' }];

      if (parentProv) {
        nextCrumbs.push({
          name: parentProv.nameZh,
          adcode: parentProv.code,
          region: parentProv,
        });

        // 判断是否为直辖市（京津沪渝，直辖市下直接是区县）
        const isMunicipality = ['110000', '120000', '310000', '500000'].includes(parentProv.code);

        if (isMunicipality) {
          nextCrumbs.push({
            name: region.nameZh,
            adcode: region.code,
            region,
          });

          // 确保直辖市所有区县已加载
          if (
            this.state.activeSubdivisions.length === 0 ||
            this.state.activeSubdivisions[0].code.slice(0, 2) !== parentProv.code.slice(0, 2)
          ) {
            const subs = await fetchSubdivisions(parentProv.code);
            this.state.activeSubdivisions = subs;
          }
        } else {
          // 普通地级市所属区县，查找所属地级市
          const cityCodePrefix = region.code.length >= 4 ? `${region.code.slice(0, 4)}00` : '';
          const parentCity = treeData.flatIndex.find(
            (item) =>
              item.level === 'city' &&
              (item.adcode === cityCodePrefix || item.name === region.parentName),
          );

          if (parentCity) {
            nextCrumbs.push({
              name: parentCity.name,
              adcode: parentCity.adcode,
              region: {
                id: `tree-${parentCity.adcode}`,
                name: parentCity.name,
                nameZh: parentCity.name,
                nameEn: parentCity.name,
                level: 'city',
                code: parentCity.adcode,
                center: parentCity.center as [number, number],
                bounds: [
                  [parentCity.center[0] - 0.4, parentCity.center[1] - 0.4],
                  [parentCity.center[0] + 0.4, parentCity.center[1] + 0.4],
                ],
                parentName: parentProv.nameZh,
              },
            });

            // 确保该地级市的区县多边形已加载
            if (
              this.state.activeSubdivisions.length === 0 ||
              this.state.activeSubdivisions[0].parentCode !== parentCity.adcode
            ) {
              const subs = await fetchSubdivisions(parentCity.adcode);
              this.state.activeSubdivisions = subs;
            }
          }

          nextCrumbs.push({
            name: region.nameZh,
            adcode: region.code,
            region,
          });
        }
      } else {
        // 兜底追加
        nextCrumbs.push({
          name: region.nameZh,
          adcode: region.code,
          region,
        });
      }

      this.state.breadcrumbs = nextCrumbs;
      this.state.loadingSubdivisions = false;
      this.notify();
      return;
    }
  }

  /**
   * 返回到面包屑指定的某一层级
   */
  async drillToBreadcrumb(index: number): Promise<void> {
    if (index <= 0) {
      // 返回顶层宏观全国/全球
      this.state.breadcrumbs = [{ name: '全国 / 全球' }];
      this.state.activeSubdivisions = [];
      this.state.selectedRegion = null;
      this.notify();
      return;
    }

    const targetItem = this.state.breadcrumbs[index];
    this.state.breadcrumbs = this.state.breadcrumbs.slice(0, index + 1);
    this.state.selectedRegion = targetItem.region || null;

    if (targetItem.adcode && targetItem.region?.level !== 'county') {
      this.state.loadingSubdivisions = true;
      this.notify();
      const subs = await fetchSubdivisions(targetItem.adcode);
      this.state.activeSubdivisions = subs;
      this.state.loadingSubdivisions = false;
      this.notify();
    } else {
      this.notify();
    }
  }

  reset(): void {
    this.state = { ...DEFAULT_STATE };
    this.notify();
  }

  // ---- 查询与复合 GeoJSON ----

  getCombinedGeoJson() {
    return getCombinedBoundariesGeoJson({
      showCountries: this.state.showCountries,
      showProvinces: this.state.showProvinces,
      showGlobalCities: this.state.showGlobalCities,
      activeSubdivisions: this.state.activeSubdivisions,
    });
  }

  searchRegions(query: string) {
    return searchAdminRegions(query);
  }

  getAllProvinces() {
    return getChinaProvinces();
  }

  getAllCountries() {
    return getWorldCountries();
  }

  getAllGlobalCities() {
    return getGlobalMajorCities();
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
    this.state = { ...DEFAULT_STATE };
  }

  deactivate(): void {
    this.active = false;
    this.ctx = null;
    this.state = { ...DEFAULT_STATE };
  }

  isActive(): boolean {
    return this.active;
  }
}
