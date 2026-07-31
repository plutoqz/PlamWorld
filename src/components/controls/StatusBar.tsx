import { Crosshair, Layers3, ZoomIn } from 'lucide-react';
import { useMapStore } from '../../stores/mapStore';

export function StatusBar() {
  const center = useMapStore((state) => state.center);
  const zoom = useMapStore((state) => state.zoom);
  const activeId = useMapStore((state) => state.activeSourceId);

  return (
    <div className="pw-statusbar" aria-label="地图状态">
      <span><Crosshair size={13} />{center[0].toFixed(4)}, {center[1].toFixed(4)}</span>
      <span><ZoomIn size={13} />{zoom.toFixed(1)}</span>
      <span className="pw-status-source"><Layers3 size={13} />{activeId}</span>
    </div>
  );
}
