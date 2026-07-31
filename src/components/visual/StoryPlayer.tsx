// components/visual/StoryPlayer.tsx — 故事地图章节播放器

import { useState, useEffect, useCallback } from 'react';
import type { StoryMapTool } from '@tools/story-map.tool';

interface StoryPlayerProps { tool: StoryMapTool; }

export function StoryPlayer({ tool }: StoryPlayerProps) {
  const [story, setStory] = useState(tool.story);
  const [current, setCurrent] = useState(tool.currentChapter);
  const [playing, setPlaying] = useState(tool.playing);
  const [editing, setEditing] = useState(tool.editing);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    tool.setOnStateChange(() => {
      setStory({ ...tool.story });
      setCurrent(tool.currentChapter);
      setPlaying(tool.playing);
      setEditing(tool.editing);
    });
    return () => tool.setOnStateChange(null);
  }, [tool]);

  const handleCapture = useCallback(() => {
    tool.captureChapter(newTitle || `第 ${story.chapters.length + 1} 章`);
    setNewTitle('');
  }, [tool, newTitle, story.chapters.length]);

  const handleExport = useCallback(() => {
    const json = tool.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${story.title}.story.json`; a.click();
    URL.revokeObjectURL(url);
  }, [tool, story.title]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (!tool.importJSON(reader.result as string)) alert('导入失败，请检查格式');
      };
      reader.readAsText(file);
    };
    input.click();
  }, [tool]);

  return (
    <div style={{
      position: 'absolute', top: 60, right: 16, zIndex: 2000, width: 320,
      maxHeight: 'calc(100vh - 100px)', overflow: 'auto',
      background: 'rgba(10,10,20,0.9)', backdropFilter: 'blur(16px)',
      borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)',
      padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>📖 {story.title}</span>
        <button onClick={() => tool.reset()} style={tinyBtn}>重置</button>
      </div>

      {/* Capture bar */}
      {editing && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
            placeholder="章节标题" onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
            style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: '#fff', fontFamily: 'inherit' }} />
          <button onClick={handleCapture} style={{ ...tinyBtn, background: 'rgba(0,229,255,0.15)', color: '#00e5ff' }}>捕获</button>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => tool.setEditing(!editing)} style={tinyBtn}>{editing ? '完成' : '编辑'}</button>
        {story.chapters.length > 0 && (
          <>
            <button onClick={() => playing ? tool.stopPlay() : tool.playAll()} style={tinyBtn}>
              {playing ? '⏸' : '▶'} {playing ? '停止' : '播放全部'}
            </button>
            <button onClick={handleExport} style={tinyBtn}>导出</button>
          </>
        )}
        <button onClick={handleImport} style={tinyBtn}>导入</button>
      </div>

      {/* Chapter list */}
      {story.chapters.map((ch, i) => (
        <button key={ch.id}
          onClick={() => tool.goToChapter(i)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', border: i === current ? '1px solid rgba(0,229,255,0.3)' : '1px solid transparent',
            borderRadius: 8, cursor: 'pointer', textAlign: 'left',
            background: i === current ? 'rgba(0,229,255,0.06)' : 'rgba(255,255,255,0.02)',
            fontFamily: 'inherit', width: '100%',
          }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', minWidth: 20 }}>{i + 1}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: i === current ? '#00e5ff' : 'rgba(255,255,255,0.8)', fontWeight: i === current ? 600 : 400 }}>
              {ch.title}
            </div>
            {ch.description && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{ch.description}</div>}
          </div>
          {editing && (
            <button onClick={(ev) => { ev.stopPropagation(); tool.removeChapter(i); }} style={{ ...tinyBtn, padding: '2px 6px', fontSize: 10 }}>✕</button>
          )}
        </button>
      ))}

      {story.chapters.length === 0 && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', padding: 20 }}>
          点击「编辑」→ 导航到目标位置 → 「捕获」添加章节
        </div>
      )}
    </div>
  );
}

const tinyBtn: React.CSSProperties = {
  padding: '4px 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)',
  cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
};
