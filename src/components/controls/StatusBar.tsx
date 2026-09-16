import { Crosshair, Globe, Layers3, ZoomIn } from 'lucide-react';
import { useMapStore } from '../../stores/mapStore';

export function StatusBar() {
  const center = useMapStore((state) => state.center);
  const zoom = useMapStore((state) => state.zoom);
  const activeId = useMapStore((state) => state.activeSourceId);
  const globe = useMapStore((state) => state.globe);
  const toggleGlobe = useMapStore((state) => state.toggleGlobe);

  return (
    <div className="pw-statusbar" aria-label="地图状态">
      <span><Crosshair size={13} />{center[0].toFixed(4)}, {center[1].toFixed(4)}</span>
      <span><ZoomIn size={13} />{zoom.toFixed(1)}</span>
      <span className="pw-status-source"><Layers3 size={13} />{activeId}</span>
      <button
        type="button"
        onClick={toggleGlobe}
        className="pw-status-source"
        style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: 0 }}
        title="点击切换投影模式"
      >
        <Globe size={13} />{globe ? '3D 地球仪' : '墨卡托平面'}
      </button>
    </div>
  );
}
