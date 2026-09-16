// core/admin-boundary.test.ts — 行政区图层核心数据测试

import { describe, it, expect, vi } from 'vitest';
import {
  getChinaProvinces,
  getWorldCountries,
  getGlobalMajorCities,
  searchAdminRegions,
  getCombinedBoundariesGeoJson,
  type AdminRegion,
} from './admin-boundary';
import { AdminBoundaryTool } from '../tools/admin-boundary.tool';
import * as adminCore from './admin-boundary';

describe('Admin Boundary Core Module', () => {
  it('should load China provinces correctly', () => {
    const provinces = getChinaProvinces();
    expect(provinces.length).toBeGreaterThanOrEqual(34);

    const beijing = provinces.find((p) => p.nameZh === '北京市');
    expect(beijing).toBeDefined();
    expect(beijing?.code).toBe('110000');
    expect(beijing?.level).toBe('province');
    expect(beijing?.bounds).toBeDefined();
    expect(beijing?.bounds[0][0]).toBeLessThan(beijing!.bounds[1][0]);

    const hunan = provinces.find((p) => p.nameZh === '湖南省');
    expect(hunan).toBeDefined();
    expect(hunan?.capital).toBe('长沙');
    expect(hunan?.short).toBe('湘');
  });

  it('should load World Countries correctly with 50m resolution', () => {
    const countries = getWorldCountries();
    expect(countries.length).toBeGreaterThan(150);

    const china = countries.find((c) => c.nameZh === '中国');
    expect(china).toBeDefined();

    const france = countries.find((c) => c.name === 'France' || c.nameZh === '法国');
    expect(france).toBeDefined();
  });

  it('should load Global Major Cities correctly', () => {
    const globalCities = getGlobalMajorCities();
    expect(globalCities.length).toBeGreaterThanOrEqual(8);

    const tokyo = globalCities.find((c) => c.nameZh.includes('东京'));
    expect(tokyo).toBeDefined();
    expect(tokyo?.level).toBe('global-city');

    const nyc = globalCities.find((c) => c.nameZh.includes('纽约'));
    expect(nyc).toBeDefined();
    expect(nyc?.bounds).toBeDefined();
  });

  it('should search regions by Chinese, English, city or county name', () => {
    const resSichuan = searchAdminRegions('四川');
    expect(resSichuan.length).toBeGreaterThanOrEqual(1);
    expect(resSichuan[0].nameZh).toBe('四川省');

    const resHunanByShort = searchAdminRegions('湘');
    expect(resHunanByShort.some((r) => r.nameZh === '湖南省')).toBe(true);

    const resJapan = searchAdminRegions('Japan');
    expect(resJapan.length).toBeGreaterThanOrEqual(1);
    expect(resJapan.some((r) => r.nameZh === '日本')).toBe(true);

    // 搜索国际城市
    const resTokyo = searchAdminRegions('东京');
    expect(resTokyo.length).toBeGreaterThanOrEqual(1);

    // 搜索地级市
    const resSuzhou = searchAdminRegions('苏州市');
    expect(resSuzhou.length).toBeGreaterThanOrEqual(1);
  });

  it('should generate combined FeatureCollection with filters', () => {
    const both = getCombinedBoundariesGeoJson({
      showCountries: true,
      showProvinces: true,
      showGlobalCities: true,
    });
    expect(both.features.length).toBeGreaterThan(200);

    const provincesOnly = getCombinedBoundariesGeoJson({
      showCountries: false,
      showProvinces: true,
      showGlobalCities: false,
    });
    expect(provincesOnly.features.length).toBe(getChinaProvinces().length);

    const countriesOnly = getCombinedBoundariesGeoJson({
      showCountries: true,
      showProvinces: false,
      showGlobalCities: false,
    });
    expect(countriesOnly.features.length).toBe(getWorldCountries().length);
  });

  it('should exclude parent province when county or city activeSubdivisions are present', () => {
    const geoJson = getCombinedBoundariesGeoJson({
      showCountries: false,
      showProvinces: true,
      showGlobalCities: false,
      activeSubdivisions: [
        {
          id: 'sub-430104',
          name: '岳麓区',
          nameZh: '岳麓区',
          nameEn: 'Yuelu',
          level: 'county',
          code: '430104',
          center: [112.93, 28.23],
          bounds: [
            [112.8, 28.1],
            [113.0, 28.3],
          ],
          parentCode: '430100',
        },
      ],
    });

    // 湖南省大面应该被排除，避免覆盖区县多边形
    const hunanFeature = geoJson.features.find((f) => f.properties?.code === '430000');
    expect(hunanFeature).toBeUndefined();

    // 其它省份（如北京市）正常保留
    const beijingFeature = geoJson.features.find((f) => f.properties?.code === '110000');
    expect(beijingFeature).toBeDefined();

    // 活跃子区划（岳麓区）应在 features 中
    const yueluFeature = geoJson.features.find((f) => f.properties?.code === '430104');
    expect(yueluFeature).toBeDefined();
  });

  it('should track breadcrumbs correctly on multi-level drill down and rewind', async () => {
    const tool = new AdminBoundaryTool();
    expect(tool.state.breadcrumbs).toHaveLength(1);
    expect(tool.state.breadcrumbs[0].name).toBe('全国 / 全球');

    const mockChangshaSubs: AdminRegion[] = [
      {
        id: 'sub-430104',
        name: '岳麓区',
        nameZh: '岳麓区',
        nameEn: 'Yuelu',
        level: 'county',
        code: '430104',
        center: [112.93, 28.23],
        bounds: [
          [112.8, 28.1],
          [113.0, 28.3],
        ],
        parentCode: '430100',
      },
    ];

    vi.spyOn(adminCore, 'fetchSubdivisions').mockResolvedValue(mockChangshaSubs);

    const changshaRegion: AdminRegion = {
      id: 'sub-430100',
      name: '长沙市',
      nameZh: '长沙市',
      nameEn: 'Changsha',
      level: 'city',
      code: '430100',
      parentName: '湖南省',
      center: [112.98, 28.19],
      bounds: [
        [111.8, 27.8],
        [114.2, 28.6],
      ],
    };

    // 下钻到长沙市（应自动补齐所属湖南省）
    await tool.drillDown(changshaRegion);

    expect(tool.state.breadcrumbs).toHaveLength(3);
    expect(tool.state.breadcrumbs[0].name).toBe('全国 / 全球');
    expect(tool.state.breadcrumbs[1].name).toBe('湖南省');
    expect(tool.state.breadcrumbs[2].name).toBe('长沙市');

    // 下钻到区县岳麓区
    const yueluRegion = mockChangshaSubs[0];
    await tool.drillDown(yueluRegion);

    expect(tool.state.breadcrumbs).toHaveLength(4);
    expect(tool.state.breadcrumbs[3].name).toBe('岳麓区');
    expect(tool.state.selectedRegion?.code).toBe('430104');

    // 点击面包屑回退到长沙市 (index 2)
    await tool.drillToBreadcrumb(2);
    expect(tool.state.breadcrumbs).toHaveLength(3);
    expect(tool.state.breadcrumbs[2].name).toBe('长沙市');

    // 点击面包屑回退到全国/全球宏观视角 (index 0)
    await tool.drillToBreadcrumb(0);
    expect(tool.state.breadcrumbs).toHaveLength(1);
    expect(tool.state.breadcrumbs[0].name).toBe('全国 / 全球');
    expect(tool.state.activeSubdivisions).toHaveLength(0);
    expect(tool.state.selectedRegion).toBeNull();
  });

  it('should cleanly replace breadcrumbs when switching across different provinces or cities without concatenation', async () => {
    const tool = new AdminBoundaryTool();
    vi.spyOn(adminCore, 'fetchSubdivisions').mockResolvedValue([]);

    // 1. 先下钻到湖南省
    const hunanRegion: AdminRegion = {
      id: 'prov-430000',
      name: '湖南省',
      nameZh: '湖南省',
      nameEn: 'Hunan',
      level: 'province',
      code: '430000',
      center: [112.98, 28.19],
      bounds: [
        [108.7, 24.6],
        [114.2, 30.1],
      ],
    };
    await tool.drillDown(hunanRegion);

    // 下钻到长沙市
    const changshaRegion: AdminRegion = {
      id: 'sub-430100',
      name: '长沙市',
      nameZh: '长沙市',
      nameEn: 'Changsha',
      level: 'city',
      code: '430100',
      parentName: '湖南省',
      center: [112.98, 28.19],
      bounds: [
        [111.8, 27.8],
        [114.2, 28.6],
      ],
    };
    await tool.drillDown(changshaRegion);

    expect(tool.state.breadcrumbs.map((b) => b.name)).toEqual(['全国 / 全球', '湖南省', '长沙市']);

    // 2. 更换到不同的省级行政区：广东省
    const guangdongRegion: AdminRegion = {
      id: 'prov-440000',
      name: '广东省',
      nameZh: '广东省',
      nameEn: 'Guangdong',
      level: 'province',
      code: '440000',
      center: [113.28, 23.12],
      bounds: [
        [109.6, 20.2],
        [117.3, 25.5],
      ],
    };
    await tool.drillDown(guangdongRegion);

    // 严正验证：必须完全清除原湖南省及长沙市，决不允许把广东省拼接在湖南路径之后！
    expect(tool.state.breadcrumbs.map((b) => b.name)).toEqual(['全国 / 全球', '广东省']);

    // 3. 下钻到广州市
    const guangzhouRegion: AdminRegion = {
      id: 'sub-440100',
      name: '广州市',
      nameZh: '广州市',
      nameEn: 'Guangzhou',
      level: 'city',
      code: '440100',
      parentName: '广东省',
      center: [113.28, 23.12],
      bounds: [
        [112.9, 22.5],
        [114.1, 23.9],
      ],
    };
    await tool.drillDown(guangzhouRegion);
    expect(tool.state.breadcrumbs.map((b) => b.name)).toEqual(['全国 / 全球', '广东省', '广州市']);

    // 4. 在同省下切换到另一个地级市：深圳市（应替换广州市，而不是拼接）
    const shenzhenRegion: AdminRegion = {
      id: 'sub-440300',
      name: '深圳市',
      nameZh: '深圳市',
      nameEn: 'Shenzhen',
      level: 'city',
      code: '440300',
      parentName: '广东省',
      center: [114.08, 22.54],
      bounds: [
        [113.7, 22.4],
        [114.6, 22.8],
      ],
    };
    await tool.drillDown(shenzhenRegion);
    expect(tool.state.breadcrumbs.map((b) => b.name)).toEqual(['全国 / 全球', '广东省', '深圳市']);
  });
});
