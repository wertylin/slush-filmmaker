'use client';

import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  Clapperboard,
  CopyPlus,
  Film,
  History,
  Maximize2,
  Mic2,
  Music,
  Pause,
  Play,
  Redo2,
  Scissors,
  Search,
  Share2,
  SkipBack,
  SkipForward,
  Sparkles,
  SplitSquareHorizontal,
  Trash2,
  Type,
  Undo2,
  Volume2,
  Wand2,
} from 'lucide-react';
import type { Scene } from '@/components/studio-actions';
import type { TimelineTrack } from '@/components/timeline';

type ClipTab = 'Clips' | 'Scenes' | 'Audio';
type InspectorTab = 'Scene' | 'Clip' | 'Style';

function formatTime(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function EditorClipsPanel({
  scenes,
  selected,
  onSelect,
}: {
  scenes: Scene[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [clipTab, setClipTab] = useState<ClipTab>('Clips');
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const base =
      clipTab === 'Audio'
        ? [
            { id: 'a1', title: 'Founder VO', meta: 'WAV · 48kHz', duration: '0:42', image: scenes[0]?.image },
            { id: 'a2', title: 'Pulse underscore', meta: 'MP3 · Loop', duration: '1:28', image: scenes[1]?.image },
            { id: 'a3', title: 'Whoosh riser', meta: 'WAV · SFX', duration: '0:03', image: scenes[2]?.image },
          ]
        : scenes.map((s, i) => ({
            id: s.id,
            title: clipTab === 'Scenes' ? s.title : `A00${i + 1}.MP4`,
            meta: clipTab === 'Scenes' ? `${s.duration}s · caption` : 'MP4 · 4K',
            duration: formatTime(s.duration),
            image: s.image,
          }));
    const q = query.trim().toLowerCase();
    return q ? base.filter((x) => x.title.toLowerCase().includes(q)) : base;
  }, [clipTab, scenes, query]);

  return (
    <div className="editor-clips">
      <div className="editor-clips-tabs">
        {(['Clips', 'Scenes', 'Audio'] as ClipTab[]).map((t) => (
          <button key={t} type="button" className={clipTab === t ? 'active' : ''} onClick={() => setClipTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="editor-clips-search">
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search assets"
          aria-label="Search assets"
        />
      </div>
      <div className="editor-clips-list">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`editor-clip-row ${selected === item.id ? 'active' : ''}`}
            onClick={() => {
              if (scenes.some((s) => s.id === item.id)) onSelect(item.id);
            }}
          >
            <span className="editor-clip-thumb">
              {item.image ? <img src={item.image} alt="" /> : <Film size={16} />}
              <i>{item.duration}</i>
            </span>
            <span>
              <b>{item.title}</b>
              <small>{item.meta}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function EditorInspector({
  scene,
  sceneIndex,
  sceneCount,
}: {
  scene: Scene;
  sceneIndex: number;
  sceneCount: number;
}) {
  const [tab, setTab] = useState<InspectorTab>('Scene');

  return (
    <div className="editor-inspector">
      <div className="editor-inspector-tabs">
        {(['Scene', 'Clip', 'Style'] as InspectorTab[]).map((t) => (
          <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Scene' && (
        <div className="editor-inspector-body">
          <label>
            Scene name
            <input readOnly value={scene.title} />
          </label>
          <div className="editor-inspector-row">
            <label>
              Index
              <input readOnly value={`${sceneIndex + 1} / ${sceneCount}`} />
            </label>
            <label>
              Duration
              <input readOnly value={`${scene.duration}s`} />
            </label>
          </div>
          <label>
            Transition to next
            <div className="editor-select-fake">
              Fade <ChevronDown size={14} />
            </div>
          </label>
          <label>
            Caption
            <textarea readOnly rows={3} value={scene.caption} />
          </label>
        </div>
      )}

      {tab === 'Clip' && (
        <div className="editor-inspector-body">
          <div className="editor-clip-meta">
            <img src={scene.image} alt="" />
            <div>
              <b>A00{sceneIndex + 1}.MP4</b>
              <small>4K · 16:9 · Demo still</small>
            </div>
          </div>
          <label>
            Volume
            <input type="range" min={0} max={100} defaultValue={82} readOnly />
          </label>
          <label>
            Speed
            <input type="range" min={25} max={200} defaultValue={100} readOnly />
          </label>
        </div>
      )}

      {tab === 'Style' && (
        <div className="editor-inspector-body">
          <label>
            Look
            <div className="editor-select-fake">
              Slush stage <ChevronDown size={14} />
            </div>
          </label>
          <label>
            Caption style
            <div className="editor-select-fake">
              Bold lower-third <ChevronDown size={14} />
            </div>
          </label>
          <label>
            Color grade
            <div className="editor-select-fake">
              Contrast punch <ChevronDown size={14} />
            </div>
          </label>
        </div>
      )}

      <div className="editor-ai-tools">
        <div className="panel-heading">
          <h4>AI tools</h4>
        </div>
        <button type="button" className="editor-ai-btn primary">
          <Sparkles size={14} /> Regenerate this scene
        </button>
        <button type="button" className="editor-ai-btn">
          <Wand2 size={14} /> Replace with new shot
        </button>
        <button type="button" className="editor-ai-btn">
          <Type size={14} /> Rewrite captions
        </button>
      </div>
    </div>
  );
}

export function ProjectEditor({
  project,
  scenes,
  selected,
  playhead,
  tracks,
  onSelect,
  onSeek,
  onProjectChange,
  onTimelineOps,
}: {
  project: string;
  scenes: Scene[];
  selected: string;
  playhead: number;
  tracks: TimelineTrack[];
  onSelect: (id: string) => void;
  onSeek: (t: number) => void;
  onProjectChange: (name: string) => void;
  onTimelineOps?: (ops: Array<Record<string, unknown>>, plan: string) => void;
}) {
  const [playing, setPlaying] = useState(false);

  const total = Math.max(1, scenes.reduce((n, s) => n + s.duration, 0));
  const scene = scenes.find((s) => s.id === selected) || scenes[0];
  const sceneIndex = Math.max(0, scenes.findIndex((s) => s.id === scene.id));
  const playheadRatio = Math.min(1, Math.max(0, playhead / total));

  const sceneBlocks = useMemo(() => {
    let t = 0;
    return scenes.map((s) => {
      const start = t;
      t += s.duration;
      return { ...s, start, end: t, left: (start / total) * 100, width: (s.duration / total) * 100 };
    });
  }, [scenes, total]);

  return (
    <div className="nle">
      <header className="nle-topbar">
        <div className="nle-project">
          <input
            className="nle-project-name"
            value={project}
            onChange={(e) => onProjectChange(e.target.value)}
            aria-label="Project name"
          />
          <div className="nle-meta">
            <span>16:9 4K</span>
            <span>{formatTime(total)}</span>
            <span>
              <i className="status-dot" /> Autosaved just now
            </span>
          </div>
        </div>
        <div className="nle-actions">
          <button type="button" className="icon-button" aria-label="Undo">
            <Undo2 size={16} />
          </button>
          <button type="button" className="icon-button" aria-label="Redo">
            <Redo2 size={16} />
          </button>
          <button type="button" className="button small outline">
            <History size={14} /> Version history
          </button>
          <button type="button" className="button small outline">
            <Play size={14} /> Preview
          </button>
          <button type="button" className="button small outline">
            <Share2 size={14} /> Share
          </button>
          <button type="button" className="button small primary">
            Export <ChevronDown size={14} />
          </button>
        </div>
      </header>

      <div className="nle-stage">
        <div className="nle-player">
          <div className="nle-frame">
            <img src={scene.image} alt={scene.title} />
            <div className="nle-frame-shade" />
            <div className="nle-overlay-copy">
              {scene.caption.split('.').filter(Boolean)[0] || scene.title}.
            </div>
            <span className="nle-scene-chip">
              SCENE {String(sceneIndex + 1).padStart(2, '0')} · {scene.title.toUpperCase()}
            </span>
          </div>
          <div className="nle-progress">
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={playheadRatio}
              onChange={(e) => onSeek(Number(e.target.value) * total)}
              aria-label="Scrub timeline"
            />
          </div>
          <div className="nle-transport">
            <span>
              {formatTime(playhead)} / {formatTime(total)}
            </span>
            <div className="nle-transport-center">
              <button
                type="button"
                className="icon-button"
                aria-label="Previous scene"
                onClick={() => onSelect(scenes[Math.max(0, sceneIndex - 1)]?.id)}
              >
                <SkipBack size={16} />
              </button>
              <button
                type="button"
                className="nle-play"
                aria-label={playing ? 'Pause' : 'Play'}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Next scene"
                onClick={() => onSelect(scenes[Math.min(scenes.length - 1, sceneIndex + 1)]?.id)}
              >
                <SkipForward size={16} />
              </button>
            </div>
            <div className="nle-transport-right">
              <Volume2 size={15} />
              <Maximize2 size={15} />
              <span>16:9</span>
            </div>
          </div>
        </div>

        <div className="nle-tools">
          <div className="nle-tools-left">
            <button
              type="button"
              onClick={() =>
                onTimelineOps?.(
                  [{ op: 'add_scene', afterSceneId: scene.id, title: 'New beat', caption: '', duration: 5 }],
                  'Add scene after selection',
                )
              }
            >
              <CopyPlus size={14} /> Add
            </button>
            <button
              type="button"
              onClick={() =>
                onTimelineOps?.(
                  [{ op: 'split_scene', sceneId: scene.id, at: Math.max(1, scene.duration / 2) }],
                  'Split selected scene',
                )
              }
            >
              <Scissors size={14} /> Split
            </button>
            <button
              type="button"
              onClick={() => onTimelineOps?.([{ op: 'delete_scene', sceneId: scene.id }], 'Delete selected scene')}
            >
              <Trash2 size={14} /> Delete
            </button>
            <button type="button" className="accent">
              <Sparkles size={14} /> Regenerate scene
            </button>
            <button type="button">
              <Wand2 size={14} /> Replace shot
            </button>
            <button type="button">
              <Type size={14} /> Sync captions
            </button>
          </div>
          <div className="nle-tools-right">
            <SplitSquareHorizontal size={15} />
            <Clapperboard size={15} />
            <Mic2 size={15} />
            <Music size={15} />
          </div>
        </div>

        <div className="nle-timeline">
          <div className="nle-ruler">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} style={{ left: `${(i / 8) * 100}%` }}>
                {formatTime((total * i) / 8)}
              </span>
            ))}
          </div>
          <div className="nle-tracks">
            {tracks.map((track) => (
              <div className="nle-track" key={track.id}>
                <div className="nle-track-label">{track.label}</div>
                <div className="nle-track-lane">
                  {track.id === 'scenes'
                    ? sceneBlocks.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          className={`nle-block ${selected === b.id ? 'active' : ''}`}
                          style={{ left: `${b.left}%`, width: `${b.width}%`, background: track.color }}
                          onClick={() => onSelect(b.id)}
                        >
                          {b.title}
                        </button>
                      ))
                    : track.clips.map((clip) => (
                        <div
                          key={clip.id}
                          className="nle-block soft"
                          style={{
                            left: `${(clip.start / total) * 100}%`,
                            width: `${Math.max(1.2, (clip.duration / total) * 100)}%`,
                            background: track.color,
                          }}
                          title={clip.label}
                        >
                          {clip.label}
                        </div>
                      ))}
                  <div className="nle-playhead" style={{ left: `${playheadRatio * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="nle-footnote">
        <span>Agent-editable via WebMCP get_timeline / propose_timeline_edits</span>
        <a href="#top">
          Open full preview <ArrowUpRight size={13} />
        </a>
      </div>
    </div>
  );
}
