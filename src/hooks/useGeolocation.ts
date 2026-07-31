// hooks/useGeolocation.ts — 浏览器 GPS 定位 Hook
// 封装 Geolocation API，提供位置获取、错误处理、加载状态

import { useState, useCallback, useRef } from 'react';
import { getEngine } from './useMap';

export interface GeolocationState {
  /** 当前定位坐标 */
  position: [number, number] | null;
  /** 是否正在定位中 */
  loading: boolean;
  /** 最近一次错误信息 */
  error: string | null;
  /** 浏览器是否支持 */
  supported: boolean;
}

export interface GeolocationOptions {
  /** 高精度模式（使用 GPS）默认 true */
  enableHighAccuracy?: boolean;
  /** 超时时间 ms，默认 8000 */
  timeout?: number;
  /** 缓存位置最大年龄 ms，默认 30000 */
  maximumAge?: number;
  /** 定位成功后是否自动 flyTo */
  flyTo?: boolean;
  /** 飞行动画目标缩放级别 */
  zoom?: number;
}

const DEFAULT_OPTIONS: GeolocationOptions = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 30000,
  flyTo: true,
  zoom: 15,
};

/**
 * useGeolocation — GPS 定位 Hook
 *
 * @example
 * const { position, loading, error, locate } = useGeolocation({ flyTo: true });
 * // <button onClick={locate}>定位</button>
 */
export function useGeolocation(options: GeolocationOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const [state, setState] = useState<GeolocationState>({
    position: null,
    loading: false,
    error: null,
    supported: 'geolocation' in navigator,
  });
  const watchIdRef = useRef<number | null>(null);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: '浏览器不支持 GPS 定位', loading: false }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setState({ position: coords, loading: false, error: null, supported: true });

        if (opts.flyTo) {
          const engine = getEngine();
          engine?.flyTo(coords, opts.zoom);
        }
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
        setState((s) => ({ ...s, loading: false, error: msg }));
      },
      {
        enableHighAccuracy: opts.enableHighAccuracy,
        timeout: opts.timeout,
        maximumAge: opts.maximumAge,
      },
    );
  }, [opts.enableHighAccuracy, opts.timeout, opts.maximumAge, opts.flyTo, opts.zoom]);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  return { ...state, locate, clearWatch };
}
