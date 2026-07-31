// tools/locate.tool.ts — GPS 定位工具 (MapTool)
// 激活后立即执行浏览器 GPS 定位，定位完成后自动停用

import { getEngine } from '../hooks/useMap';
import type { MapTool, ToolContext } from '../core/tools';

export class LocateTool implements MapTool {
  readonly id = 'locate';
  readonly name = 'GPS 定位';
  readonly icon = '📍';
  readonly category = 'navigation';
  readonly description = '使用浏览器 GPS 定位当前位置，并飞行动画移动到该位置';
  readonly exclusive = false;

  private active = false;
  private watchId: number | null = null;

  activate(_ctx: ToolContext): void {
    if (this.active) return;
    this.active = true;

    if (!navigator.geolocation) {
      console.warn('[LocateTool] 浏览器不支持 GPS 定位');
      this.active = false;
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [
          pos.coords.longitude,
          pos.coords.latitude,
        ];
        const engine = getEngine();
        engine?.flyTo(coords, 15);
        this.active = false;
      },
      (err) => {
        let msg = '定位失败';
        switch (err.code) {
          case err.PERMISSION_DENIED:
            msg = '用户拒绝了定位权限';
            break;
          case err.POSITION_UNAVAILABLE:
            msg = '位置信息不可用';
            break;
          case err.TIMEOUT:
            msg = '定位请求超时';
            break;
        }
        console.warn(`[LocateTool] ${msg}`);
        this.active = false;
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  deactivate(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }
}
