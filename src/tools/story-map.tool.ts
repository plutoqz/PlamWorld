// tools/story-map.tool.ts — 故事地图 / 叙事构建器工具 (MapTool)
//
// 本质：Zustand 视图状态快照序列 → 序列化 → 回放动画
// 每章保存：center / zoom / pitch / bearing / 描述 / 媒体

import type { MapTool, ToolContext } from '../core/tools';
import type { LngLat } from '../core/types';

export interface StoryChapter {
  id: string;
  title: string;
  description: string;
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
  transition: 'fly' | 'ease' | 'cut';
  duration: number; // ms
}

export interface StoryMap {
  id: string;
  title: string;
  chapters: StoryChapter[];
  exportDate: string;
}

export class StoryMapTool implements MapTool {
  readonly id = 'story-map';
  readonly name = '故事地图';
  readonly icon = '📖';
  readonly category = 'story';
  readonly description = '创建章节序列，自动飞行动画回放';
  readonly exclusive = true;

  private active = false;
  private ctx: ToolContext | null = null;
  private _story: StoryMap;
  private _currentChapter = 0;
  private _playing = false;
  private _editing = false;
  private onStateChange: (() => void) | null = null;

  constructor() {
    this._story = {
      id: crypto.randomUUID?.() ?? 'story-1',
      title: '未命名故事',
      chapters: [],
      exportDate: new Date().toISOString(),
    };
  }

  // ---- callbacks ----

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  notify(): void {
    this.onStateChange?.();
  }

  // ---- getters ----

  get story(): Readonly<StoryMap> { return this._story; }
  get currentChapter(): number { return this._currentChapter; }
  get playing(): boolean { return this._playing; }
  get editing(): boolean { return this._editing; }
  get engine() { return this.ctx?.engine ?? null; }

  // ---- setters ----

  setTitle(title: string): void {
    this._story = { ...this._story, title };
    this.notify();
  }

  setEditing(v: boolean): void {
    this._editing = v;
    this.notify();
  }

  /** 捕获当前视图状态为章节 */
  captureChapter(title: string, description = ''): void {
    const engine = this.ctx?.engine;
    if (!engine) return;

    const center = engine.getCenter();
    const zoom = engine.getZoom();

    const chapter: StoryChapter = {
      id: `ch-${Date.now()}`,
      title: title || `第 ${this._story.chapters.length + 1} 章`,
      description,
      center,
      zoom,
      pitch: 0,
      bearing: 0,
      transition: 'fly',
      duration: 3000,
    };

    this._story = {
      ...this._story,
      chapters: [...this._story.chapters, chapter],
    };
    this.notify();
  }

  removeChapter(index: number): void {
    const chapters = [...this._story.chapters];
    chapters.splice(index, 1);
    this._story = { ...this._story, chapters };
    if (this._currentChapter >= chapters.length) {
      this._currentChapter = Math.max(0, chapters.length - 1);
    }
    this.notify();
  }

  reorderChapters(fromIndex: number, toIndex: number): void {
    const chapters = [...this._story.chapters];
    const [moved] = chapters.splice(fromIndex, 1);
    chapters.splice(toIndex, 0, moved);
    this._story = { ...this._story, chapters };
    this.notify();
  }

  updateChapter(index: number, partial: Partial<StoryChapter>): void {
    const chapters = [...this._story.chapters];
    if (index >= 0 && index < chapters.length) {
      chapters[index] = { ...chapters[index], ...partial };
      this._story = { ...this._story, chapters };
    }
    this.notify();
  }

  /** 跳转到指定章节 */
  goToChapter(index: number): void {
    const engine = this.ctx?.engine;
    if (!engine) return;
    const ch = this._story.chapters[index];
    if (!ch) return;

    this._currentChapter = index;
    engine.flyTo(ch.center, ch.zoom, { duration: ch.duration });
    this.notify();
  }

  /** 自动播放所有章节 */
  async playAll(): Promise<void> {
    if (this._playing) return;
    this._playing = true;
    this._currentChapter = 0;
    this.notify();

    const engine = this.ctx?.engine;
    if (!engine) { this._playing = false; return; }

    for (let i = 0; i < this._story.chapters.length; i++) {
      if (!this._playing) break;
      const ch = this._story.chapters[i];
      this._currentChapter = i;
      this.notify();

      await new Promise<void>((resolve) => {
        engine!.flyTo(ch.center, ch.zoom, { duration: ch.duration });
        setTimeout(resolve, ch.duration + 500);
      });
    }

    this._playing = false;
    this.notify();
  }

  stopPlay(): void {
    this._playing = false;
    this.notify();
  }

  /** 导出为 JSON */
  exportJSON(): string {
    return JSON.stringify(this._story, null, 2);
  }

  /** 从 JSON 导入 */
  importJSON(json: string): boolean {
    try {
      const obj = JSON.parse(json);
      if (obj.chapters && Array.isArray(obj.chapters)) {
        this._story = obj as StoryMap;
        this._currentChapter = 0;
        this.notify();
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  reset(): void {
    this._story = {
      id: crypto.randomUUID?.() ?? 'story-1',
      title: '未命名故事',
      chapters: [],
      exportDate: new Date().toISOString(),
    };
    this._currentChapter = 0;
    this._playing = false;
    this._editing = false;
    this.notify();
  }

  // ---- lifecycle ----

  activate(ctx: ToolContext): void {
    this.active = true;
    this.ctx = ctx;
  }

  deactivate(): void {
    this.active = false;
    this.ctx = null;
    this._playing = false;
  }

  isActive(): boolean {
    return this.active;
  }
}
