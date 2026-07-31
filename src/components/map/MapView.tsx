// components/map/MapView.tsx — 地图主视图组件

import { useMap } from '../../hooks/useMap';

export function MapView() {
  const containerRef = useMap();

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0 }}
    />
  );
}
