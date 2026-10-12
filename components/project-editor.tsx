'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  Clapperboard,
  CopyPlus,
  Download,
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
  Upload,
  Volume2,
  Wand2,
} from 'lucide-react';
import type { Scene } from '@/components/studio-actions';
import {
  clipAtPlayhead,
  isMediaTrackId,
  type MediaTrackId,
  type TimelineTrack,
  type TrackId,
} from '@/components/timeline';
import type { Block } from '@/lib/blocks';
import { downloadBlob, exportFilmVideo } from '@/lib/export-video';
import {
  ingestMediaFile,
  isSlushAssetDrag,
  parseSlushAssetDrag,
  pickMediaFile,
  SLUSH_ASSET_MIME,
  type IngestedMedia,
  type SlushAssetPayload,
} from '@/lib/ingest-media';

export type PlaceTarget = { trackId: MediaTrackId; start?: number };

type InspectorTab = 'Scene' | 'Clip' | 'Style';

function formatTime(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function canAcceptEditorDrop(dt: DataTransfer, allowFiles: boolean, allowAsset: boolean) {
  const types = Array.from(dt.types);
  if (allowAsset && types.includes(SLUSH_ASSET_MIME)) return true;
  if (allowFiles && types.includes('Files')) return true;
  return false;
}

function useMediaDropZone(
  onFile: ((file: File) => void | Promise<void>) | undefined,
  onError?: (message: string) => void,
  onAsset?: (asset: SlushAssetPayload) => void | Promise<void>,
) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const onDragEnter = (e: DragEvent) => {
    if (!canAcceptEditorDrop(e.dataTransfer, !!onFile, !!onAsset)) return;
    e.preventDefault();
    depth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!canAcceptEditorDrop(e.dataTransfer, !!onFile, !!onAsset)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: DragEvent) => {
    if (!onFile && !onAsset) return;
    e.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!onFile && !onAsset) return;
    e.preventDefault();
    depth.current = 0;
    setDragging(false);

    if (onAsset && isSlushAssetDrag(e.dataTransfer)) {
      const asset = parseSlushAssetDrag(e.dataTransfer);
      if (!asset) {
        onError?.('Could not read asset');
        return;
      }
      void Promise.resolve(onAsset(asset)).catch((err) =>
        onError?.(err instanceof Error ? err.message : 'Drop failed'),
      );
      return;
    }

    if (!onFile) return;
    const file = pickMediaFile(e.dataTransfer.files);
    if (!file) {
      onError?.('Drop an image or video file');
      return;
    }
    void Promise.resolve(onFile(file)).catch((err) =>
      onError?.(err instanceof Error ? err.message : 'Drop failed'),
    );
  };

  return { dragging, dropHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}

export function EditorClipsPanel({
  assets,
  scenes,
  selected,
  tracks,
  onApplyAsset,
  onPlaceMedia,
  onNotice,
}: {
  assets: Block[];
  scenes: Scene[];
  selected: string;
  tracks?: TimelineTrack[];
  onApplyAsset?: (asset: SlushAssetPayload, target?: PlaceTarget) => void;
  onPlaceMedia?: (file: File, target?: PlaceTarget) => void | Promise<void>;
  onNotice?: (text: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { dragging, dropHandlers } = useMediaDropZone(
    onPlaceMedia
      ? async (file) => {
          setUploadBusy(true);
          try {
            await onPlaceMedia(file, { trackId: 'broll' });
          } finally {
            setUploadBusy(false);
          }
        }
      : undefined,
    onNotice,
  );

  const items = useMemo(() => {
    const library = assets;
    const onTimeline = new Set<string>();
    for (const t of tracks || []) {
      for (const c of t.clips) {
        if (c.image) onTimeline.add(c.image);
      }
    }
    const selectedScene = scenes.find((s) => s.id === selected) || scenes[0];
    const q = query.trim().toLowerCase();
    return (q ? library.filter((b) => b.description.toLowerCase().includes(q)) : library).map((b) => {
      const layered = onTimeline.has(b.image);
      const onSelected = selectedScene?.image === b.image;
      return {
        id: b.id || b.key,
        key: b.key,
        title: b.description,
        image: b.image,
        duration: formatTime(b.duration || 6),
        meta: layered ? 'on timeline' : onSelected ? 'scene still' : 'library',
        layered,
        payload: {
          image: b.image,
          description: b.description,
          duration: b.duration,
          key: b.key,
          video: b.video || undefined,
        } satisfies SlushAssetPayload,
      };
    });
  }, [assets, scenes, query, selected, tracks]);

  return (
    <div className={`editor-clips ${dragging ? 'is-drop-target' : ''}`} {...dropHandlers}>
      <div className="editor-clips-head">
        <div className="editor-clips-tabs editor-clips-tabs-single">
          <button type="button" className="active" tabIndex={-1}>
            Assets
          </button>
        </div>
        <button
          type="button"
          className="editor-clips-upload"
          disabled={uploadBusy || !onPlaceMedia}
          onClick={() => fileRef.current?.click()}
          aria-label="Upload asset"
        >
          <Upload size={14} />
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(e) => {
          const file = pickMediaFile(e.target.files);
          e.target.value = '';
          if (!file || !onPlaceMedia) return;
          setUploadBusy(true);
          void Promise.resolve(onPlaceMedia(file, { trackId: 'broll' }))
            .catch((err) => onNotice?.(err instanceof Error ? err.message : 'Upload failed'))
            .finally(() => setUploadBusy(false));
        }}
      />
      <div className="editor-clips-search">
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search assets"
          aria-label="Search assets"
        />
      </div>
      {dragging ? <div className="editor-clips-drop-hint">Drop to add on B-roll</div> : null}
      <div className="editor-clips-list">
        {items.length === 0 ? (
          <div className="editor-clips-empty">
            No assets yet — upload here or generate with Sophie.
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              draggable
              className={`editor-clip-row ${item.layered ? 'active' : ''}`}
              title="Click → B-roll · drag onto Founder / Product / B-roll"
              onDragStart={(e) => {
                const raw = JSON.stringify(item.payload);
                e.dataTransfer.setData(SLUSH_ASSET_MIME, raw);
                e.dataTransfer.setData('text/plain', raw);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onApplyAsset?.(item.payload, { trackId: 'broll' })}
            >
              <span className="editor-clip-thumb">
                {item.image ? <img src={item.image} alt="" draggable={false} /> : <Film size={16} />}
                <i>{item.duration}</i>
              </span>
              <span>
                <b>{item.title}</b>
                <small>{item.meta}</small>
              </span>
            </button>
          ))
        )}
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
  const mediaLabel = scene.video ? 'VIDEO' : 'STILL';

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
            Caption
            <textarea readOnly rows={3} value={scene.caption || ''} />
          </label>
        </div>
      )}

      {tab === 'Clip' && (
        <div className="editor-inspector-body">
          <div className="editor-clip-meta">
            {scene.image ? <img src={scene.image} alt="" /> : <Film size={28} />}
            <div>
              <b>{scene.title}</b>
              <small>
                {mediaLabel} · {scene.duration}s · id {scene.id}
              </small>
            </div>
          </div>
          {scene.video ? (
            <label>
              Video source
              <input readOnly value={scene.video} />
            </label>
          ) : (
            <p className="editor-inspector-hint">No video on this scene yet — drop media or generate a still.</p>
          )}
        </div>
      )}

      {tab === 'Style' && (
        <div className="editor-inspector-body">
          <p className="editor-inspector-hint">
            Look / grade / caption style aren’t wired yet. Scene media and captions come from project state.
          </p>
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
  onNotice,
  onReplaceMedia,
  onApplyAsset,
  onPlaceMedia,
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
  onNotice?: (text: string) => void;
  /** Replace shot button — writes into the selected scene still */
  onReplaceMedia?: (media: IngestedMedia) => void | Promise<void>;
  /** Place library asset as a layered clip (CapCut-style) */
  onApplyAsset?: (asset: SlushAssetPayload, target?: PlaceTarget) => void;
  /** File drop → library + layered clip */
  onPlaceMedia?: (file: File, target?: PlaceTarget) => void | Promise<void>;
}) {
  const [playing, setPlaying] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [laneDropTrack, setLaneDropTrack] = useState<MediaTrackId | null>(null);
  const [selectedClip, setSelectedClip] = useState<{ trackId: TrackId; clipId: string } | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayVideoRef = useRef<HTMLVideoElement>(null);

  const placeOnTrack = (trackId: MediaTrackId, start?: number) => ({ trackId, start: start ?? playhead });

  const { dragging, dropHandlers } = useMediaDropZone(
    onPlaceMedia
      ? async (file) => {
          setIngestBusy(true);
          try {
            await onPlaceMedia(file, placeOnTrack('broll'));
          } finally {
            setIngestBusy(false);
          }
        }
      : undefined,
    onNotice,
    onApplyAsset
      ? (asset) => {
          onApplyAsset(asset, placeOnTrack('broll'));
        }
      : undefined,
  );

  function onLaneDragOver(e: DragEvent, trackId: TrackId) {
    if (!isMediaTrackId(trackId)) return;
    if (!onApplyAsset && !onPlaceMedia) return;
    if (!isSlushAssetDrag(e.dataTransfer) && !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setLaneDropTrack(trackId);
  }

  function onLaneDrop(e: DragEvent, trackId: TrackId) {
    if (!isMediaTrackId(trackId)) return;
    e.preventDefault();
    e.stopPropagation();
    setLaneDropTrack(null);
    const target = placeOnTrack(trackId);

    if (onApplyAsset && isSlushAssetDrag(e.dataTransfer)) {
      const asset = parseSlushAssetDrag(e.dataTransfer);
      if (!asset) {
        onNotice?.('Could not read asset');
        return;
      }
      onApplyAsset(asset, target);
      return;
    }

    if (!onPlaceMedia) return;
    const file = pickMediaFile(e.dataTransfer.files);
    if (!file) {
      onNotice?.('Drop an image or video');
      return;
    }
    setIngestBusy(true);
    void Promise.resolve(onPlaceMedia(file, target))
      .catch((err) => onNotice?.(err instanceof Error ? err.message : 'Drop failed'))
      .finally(() => setIngestBusy(false));
  }

  useEffect(() => {
    if (!exportOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [exportOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      if (!onTimelineOps) return;
      if (selectedClip) {
        e.preventDefault();
        onTimelineOps(
          [{ op: 'delete_clip', trackId: selectedClip.trackId, clipId: selectedClip.clipId }],
          'Delete selected clip',
        );
        setSelectedClip(null);
        return;
      }
      const current = scenes.find((s) => s.id === selected) || scenes[0];
      if (!current || scenes.length <= 1) return;
      e.preventDefault();
      onTimelineOps([{ op: 'delete_scene', sceneId: current.id }], 'Delete selected scene');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onTimelineOps, scenes, selected, selectedClip]);

  const total = Math.max(1, scenes.reduce((n, s) => n + s.duration, 0));
  const scene = scenes.find((s) => s.id === selected) || scenes[0];
  const sceneIndex = scene ? Math.max(0, scenes.findIndex((s) => s.id === scene.id)) : 0;
  const playheadRatio = Math.min(1, Math.max(0, playhead / total));
  const overlay = clipAtPlayhead(tracks, playhead);
  const frameImage = overlay?.image || scene?.image || '';
  const frameVideo = overlay?.video || (!overlay ? scene?.video : undefined) || '';
  const frameTitle = overlay?.label || scene?.title || 'No scene';
  const frameCaption = scene?.caption || 'Pick a template to load scenes.';

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !frameVideo || overlay?.video) return;
    if (playing) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [playing, frameVideo, selected, overlay?.video]);

  useEffect(() => {
    const el = overlayVideoRef.current;
    if (!el || !overlay?.video) return;
    if (playing) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [playing, overlay?.video, overlay?.id]);

  const sceneBlocks = useMemo(() => {
    let t = 0;
    return scenes.map((s) => {
      const start = t;
      t += s.duration;
      return { ...s, start, end: t, left: (start / total) * 100, width: (s.duration / total) * 100 };
    });
  }, [scenes, total]);

  async function runExport() {
    if (exporting) return;
    if (!scenes.some((s) => s.image)) {
      onNotice?.('Add scene stills before exporting.');
      return;
    }
    setExportOpen(false);
    setExporting(true);
    setExportPct(0);
    setPlaying(false);
    onNotice?.('Exporting film…');
    try {
      const result = await exportFilmVideo({
        project,
        scenes: scenes.map((s) => ({
          title: s.title,
          caption: s.caption,
          image: s.image,
          duration: s.duration,
        })),
        onProgress: (p) => {
          setExportPct(Math.round(p.progress * 100));
          if (p.phase === 'encoding' || p.phase === 'loading') {
            onNotice?.(p.message);
          }
        },
      });
      downloadBlob(result.blob, result.filename);
      onNotice?.(`Downloaded ${result.filename}`);
    } catch (err) {
      onNotice?.(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
      setExportPct(0);
    }
  }

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
            <span>16:9 720p</span>
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
          <div className="nle-export" ref={exportRef}>
            <button
              type="button"
              className="button small primary"
              disabled={exporting || !scenes.length}
              aria-expanded={exportOpen}
              aria-haspopup="menu"
              onClick={() => setExportOpen((o) => !o)}
            >
              {exporting ? `Exporting ${exportPct}%` : 'Export'} <ChevronDown size={14} />
            </button>
            {exportOpen && !exporting ? (
              <div className="nle-export-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => void runExport()}>
                  <Download size={14} />
                  <span>
                    <b>Download film</b>
                    <small>WebM · 1280×720 · stills + captions (~film length)</small>
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="nle-stage">
        <div className="nle-player">
          <div
            className={`nle-frame ${dragging ? 'is-drop-target' : ''}${ingestBusy ? ' is-ingest' : ''}`}
            {...dropHandlers}
          >
            {overlay?.video ? (
              <video
                ref={overlayVideoRef}
                key={overlay.video}
                src={overlay.video}
                poster={overlay.image || undefined}
                muted
                playsInline
                loop
                preload="metadata"
              />
            ) : frameVideo ? (
              <video
                ref={videoRef}
                key={frameVideo}
                src={frameVideo}
                poster={frameImage || undefined}
                muted
                playsInline
                loop
                preload="metadata"
              />
            ) : frameImage ? (
              <img src={frameImage} alt={frameTitle} />
            ) : (
              <div className="nle-frame-empty" />
            )}
            <div className="nle-frame-shade" />
            <div className="nle-overlay-copy">
              {overlay
                ? overlay.label
                : frameCaption.split('.').filter(Boolean)[0] || frameTitle}
              {overlay ? '' : '.'}
            </div>
            <span className="nle-scene-chip">
              {overlay
                ? `${overlay.trackId.toUpperCase()} · ${frameTitle.toUpperCase()}`
                : `SCENE ${String(sceneIndex + 1).padStart(2, '0')} · ${frameTitle.toUpperCase()}`}
            </span>
            {dragging || ingestBusy ? (
              <div className="nle-drop-overlay">
                {ingestBusy ? 'Reading media…' : 'Drop onto B-roll at playhead'}
              </div>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              const file = pickMediaFile(e.target.files);
              e.target.value = '';
              if (!file || !onReplaceMedia) return;
              setIngestBusy(true);
              void ingestMediaFile(file)
                .then((media) => onReplaceMedia(media))
                .catch((err) => onNotice?.(err instanceof Error ? err.message : 'Ingest failed'))
                .finally(() => setIngestBusy(false));
            }}
          />
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
                  [
                    scene
                      ? { op: 'add_scene', afterSceneId: scene.id, title: 'New beat', caption: '', duration: 5 }
                      : { op: 'add_scene', title: 'New beat', caption: '', duration: 5 },
                  ],
                  'Add scene after selection',
                )
              }
            >
              <CopyPlus size={14} /> Add
            </button>
            <button
              type="button"
              disabled={!scene}
              onClick={() => {
                if (!scene) return;
                onTimelineOps?.(
                  [{ op: 'split_scene', sceneId: scene.id, at: Math.max(1, scene.duration / 2) }],
                  'Split selected scene',
                );
              }}
            >
              <Scissors size={14} /> Split
            </button>
            <button
              type="button"
              disabled={!selectedClip && !scene}
              onClick={() => {
                if (selectedClip) {
                  onTimelineOps?.(
                    [{ op: 'delete_clip', trackId: selectedClip.trackId, clipId: selectedClip.clipId }],
                    'Delete selected clip',
                  );
                  setSelectedClip(null);
                  return;
                }
                if (!scene) return;
                onTimelineOps?.([{ op: 'delete_scene', sceneId: scene.id }], 'Delete selected scene');
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
            <button type="button" className="accent">
              <Sparkles size={14} /> Regenerate scene
            </button>
            <button
              type="button"
              disabled={!scene || ingestBusy || !onReplaceMedia}
              onClick={() => fileRef.current?.click()}
            >
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
            {tracks.map((track) => {
              const mediaLane = isMediaTrackId(track.id);
              return (
                <div className="nle-track" key={track.id}>
                  <div className="nle-track-label">{track.label}</div>
                  <div
                    className={`nle-track-lane${laneDropTrack === track.id ? ' is-drop-target' : ''}${mediaLane ? ' accepts-media' : ''}`}
                    onDragOver={(e) => onLaneDragOver(e, track.id)}
                    onDragLeave={() =>
                      setLaneDropTrack((cur) => (cur === track.id ? null : cur))
                    }
                    onDrop={(e) => onLaneDrop(e, track.id)}
                  >
                    {track.id === 'scenes'
                      ? sceneBlocks.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            className={`nle-block ${selected === b.id && !selectedClip ? 'active' : ''}`}
                            style={{ left: `${b.left}%`, width: `${b.width}%`, background: track.color }}
                            onClick={() => {
                              setSelectedClip(null);
                              onSelect(b.id);
                            }}
                          >
                            {b.title}
                          </button>
                        ))
                      : track.clips.map((clip) => {
                          const active =
                            selectedClip?.trackId === track.id && selectedClip.clipId === clip.id;
                          const media = mediaLane && !!clip.image;
                          return media ? (
                            <button
                              key={clip.id}
                              type="button"
                              className={`nle-block media ${active ? 'active' : ''}`}
                              style={{
                                left: `${(clip.start / total) * 100}%`,
                                width: `${Math.max(1.2, (clip.duration / total) * 100)}%`,
                                backgroundImage: clip.image ? `url(${clip.image})` : undefined,
                                backgroundColor: track.color,
                              }}
                              title={clip.label}
                              onClick={() => {
                                setSelectedClip({ trackId: track.id, clipId: clip.id });
                                onSeek(clip.start + Math.min(0.2, clip.duration / 2));
                              }}
                            >
                              <span>{clip.label}</span>
                            </button>
                          ) : (
                            <div
                              key={clip.id}
                              className={`nle-block soft ${active ? 'active' : ''}`}
                              style={{
                                left: `${(clip.start / total) * 100}%`,
                                width: `${Math.max(1.2, (clip.duration / total) * 100)}%`,
                                background: track.color,
                              }}
                              title={clip.label}
                            >
                              {clip.label}
                            </div>
                          );
                        })}
                    {mediaLane && track.clips.length === 0 ? (
                      <span className="nle-lane-hint">Drop media here</span>
                    ) : null}
                    <div className="nle-playhead" style={{ left: `${playheadRatio * 100}%` }} />
                  </div>
                </div>
              );
            })}
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
