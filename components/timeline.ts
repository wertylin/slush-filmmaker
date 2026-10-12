import { photos } from '@/components/shared';
import type { Scene } from '@/components/studio-actions';

export const TRACK_DEFS = [
  { id: 'scenes', label: 'Scenes', color: 'var(--red)' },
  { id: 'founder', label: 'Founder Video', color: '#3b82f6' },
  { id: 'product', label: 'Product Screens', color: '#22c55e' },
  { id: 'broll', label: 'B-roll', color: '#eab308' },
  { id: 'titles', label: 'Titles', color: '#f97316' },
  { id: 'vo', label: 'Voiceover', color: '#a855f7' },
  { id: 'music', label: 'Music', color: '#14b8a6' },
  { id: 'sfx', label: 'SFX', color: '#64748b' },
  { id: 'captions', label: 'Captions', color: '#8b5cf6' },
] as const;

export type TrackId = (typeof TRACK_DEFS)[number]['id'];

export type TimelineClip = {
  id: string;
  label: string;
  start: number;
  duration: number;
  sceneId?: string;
  /** Still / poster shown on the timeline + preview overlay */
  image?: string;
  /** Optional video URL for preview playback */
  video?: string;
};

/** Tracks that accept dragged media as CapCut-style layered clips. */
export const MEDIA_TRACK_IDS = ['founder', 'product', 'broll'] as const;
export type MediaTrackId = (typeof MEDIA_TRACK_IDS)[number];

export function isMediaTrackId(id: string): id is MediaTrackId {
  return (MEDIA_TRACK_IDS as readonly string[]).includes(id);
}

/** Topmost visual clip under playhead (later MEDIA_TRACK_IDS win — broll over product over founder). */
export function clipAtPlayhead(tracks: TimelineTrack[], t: number): (TimelineClip & { trackId: TrackId }) | null {
  let hit: (TimelineClip & { trackId: TrackId }) | null = null;
  for (const trackId of MEDIA_TRACK_IDS) {
    const track = tracks.find((x) => x.id === trackId);
    if (!track) continue;
    for (const c of track.clips) {
      if (t >= c.start && t < c.start + c.duration && (c.image || c.video)) {
        hit = { ...c, trackId };
      }
    }
  }
  return hit;
}

export type TimelineTrack = {
  id: TrackId;
  label: string;
  color: string;
  clips: TimelineClip[];
};

export type TimelineSnapshot = {
  totalDuration: number;
  playhead: number;
  selectedSceneId: string;
  scenes: Array<Scene & { start: number; end: number }>;
  tracks: TimelineTrack[];
};

export type TimelineOp =
  | { op: 'update_scene'; sceneId: string; title?: string; caption?: string; duration?: number }
  | { op: 'reorder_scenes'; sceneIds: string[] }
  | { op: 'add_scene'; afterSceneId?: string; title: string; caption?: string; duration?: number }
  | { op: 'delete_scene'; sceneId: string }
  | { op: 'split_scene'; sceneId: string; at: number }
  | { op: 'select_scene'; sceneId: string }
  | { op: 'seek'; t: number }
  | {
      op: 'upsert_clip';
      trackId: TrackId;
      clip: {
        id?: string;
        label: string;
        start: number;
        duration: number;
        sceneId?: string;
        image?: string;
        video?: string;
      };
    }
  | { op: 'delete_clip'; trackId: TrackId; clipId: string }
  | {
      op: 'update_clip';
      trackId: TrackId;
      clipId: string;
      label?: string;
      start?: number;
      duration?: number;
    }
  | { op: 'open_editor' };

export type TimelineState = {
  scenes: Scene[];
  selectedSceneId: string;
  playhead: number;
  tracks: TimelineTrack[];
};

const TRACK_IDS = new Set<string>(TRACK_DEFS.map((t) => t.id));

export function isTrackId(id: string): id is TrackId {
  return TRACK_IDS.has(id);
}

export function clampDuration(n: unknown, fallback = 6) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(1, Math.min(60, Math.round(v * 10) / 10));
}

export function clampTime(n: unknown, max: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(max, v));
}

export function sceneTimeline(scenes: Scene[]) {
  let t = 0;
  return scenes.map((s) => {
    const start = t;
    t += s.duration;
    return { ...s, start, end: t };
  });
}

export function totalDuration(scenes: Scene[]) {
  return scenes.reduce((n, s) => n + s.duration, 0);
}

/** Legacy demo clip ids — never re-seed these into the Editor. */
const SEED_CLIP_IDS = new Set([
  'clip-founder-acam',
  'clip-founder-close',
  'clip-product-ui',
  'clip-broll-world',
  'clip-broll-crowd',
  'clip-title-open',
  'clip-title-end',
  'clip-vo-arc',
  'clip-music-1',
  'clip-sfx-turn',
  'clip-sfx-resolve',
]);

/** Empty track shells + captions derived from scenes. No fake A/V clips. */
export function buildInitialTracks(scenes: Scene[]): TimelineTrack[] {
  return syncDerivedTracks(
    TRACK_DEFS.map((def) => ({ ...def, clips: [] as TimelineClip[] })),
    scenes,
  );
}

/** Drop legacy hardcoded seed clips; keep real agent/user upserts. */
export function sanitizeTracks(tracks: TimelineTrack[], scenes: Scene[]): TimelineTrack[] {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const shells: TimelineTrack[] = TRACK_DEFS.map((def) => {
    const existing = byId.get(def.id);
    if (!existing) return { ...def, clips: [] as TimelineClip[] };
    if (def.id === 'scenes' || def.id === 'captions') {
      return { ...def, clips: [] };
    }
    return {
      ...def,
      clips: existing.clips.filter((c) => !SEED_CLIP_IDS.has(c.id)),
    };
  });
  return syncDerivedTracks(shells, scenes);
}

export function syncDerivedTracks(tracks: TimelineTrack[], scenes: Scene[]): TimelineTrack[] {
  const caps = sceneTimeline(scenes).map((s) => ({
    id: `cap-${s.id}`,
    label: 'CC',
    start: s.start,
    duration: s.duration,
    sceneId: s.id,
  }));
  const total = totalDuration(scenes);
  return tracks.map((track) => {
    if (track.id === 'captions') return { ...track, clips: caps };
    if (track.id === 'music') {
      return {
        ...track,
        clips: track.clips.map((c, i) => (i === 0 ? { ...c, start: 0, duration: Math.max(total, 1) } : c)),
      };
    }
    return track;
  });
}

export function buildTimelineSnapshot(state: TimelineState): TimelineSnapshot {
  const scenes = sceneTimeline(state.scenes);
  const total = totalDuration(state.scenes);
  return {
    totalDuration: total,
    playhead: clampTime(state.playhead, Math.max(total, 0.001)),
    selectedSceneId: state.selectedSceneId,
    scenes,
    tracks: state.tracks.map((t) =>
      t.id === 'scenes'
        ? {
            ...t,
            clips: scenes.map((s) => ({
              id: s.id,
              label: s.title,
              start: s.start,
              duration: s.duration,
              sceneId: s.id,
            })),
          }
        : t,
    ),
  };
}

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function applyTimelineOps(
  state: TimelineState,
  ops: TimelineOp[],
): { state: TimelineState; results: Array<{ op: string; ok: boolean; detail?: string }>; openEditor: boolean } {
  let scenes = [...state.scenes];
  let selectedSceneId = state.selectedSceneId;
  let playhead = state.playhead;
  let tracks = state.tracks.map((t) => ({ ...t, clips: [...t.clips] }));
  let openEditor = false;
  const results: Array<{ op: string; ok: boolean; detail?: string }> = [];

  const ensureScene = (id: string) => {
    const s = scenes.find((x) => x.id === id);
    if (!s) throw new Error(`Scene not found: ${id}`);
    return s;
  };

  for (const raw of ops) {
    try {
      switch (raw.op) {
        case 'open_editor':
          openEditor = true;
          results.push({ op: 'open_editor', ok: true });
          break;

        case 'select_scene': {
          ensureScene(raw.sceneId);
          selectedSceneId = raw.sceneId;
          openEditor = true;
          const placed = sceneTimeline(scenes).find((s) => s.id === raw.sceneId);
          if (placed) playhead = placed.start + placed.duration / 2;
          results.push({ op: 'select_scene', ok: true, detail: raw.sceneId });
          break;
        }

        case 'seek': {
          const total = totalDuration(scenes);
          playhead = clampTime(raw.t, Math.max(total, 0.001));
          openEditor = true;
          let acc = 0;
          for (const s of scenes) {
            if (playhead < acc + s.duration) {
              selectedSceneId = s.id;
              break;
            }
            acc += s.duration;
          }
          results.push({ op: 'seek', ok: true, detail: `${playhead.toFixed(2)}s` });
          break;
        }

        case 'update_scene': {
          ensureScene(raw.sceneId);
          scenes = scenes.map((s) =>
            s.id === raw.sceneId
              ? {
                  ...s,
                  title: raw.title != null ? String(raw.title).trim() || s.title : s.title,
                  caption: raw.caption != null ? String(raw.caption) : s.caption,
                  duration: raw.duration != null ? clampDuration(raw.duration, s.duration) : s.duration,
                }
              : s,
          );
          tracks = syncDerivedTracks(tracks, scenes);
          openEditor = true;
          results.push({ op: 'update_scene', ok: true, detail: raw.sceneId });
          break;
        }

        case 'reorder_scenes': {
          const ids = raw.sceneIds.map(String);
          if (ids.length !== scenes.length || new Set(ids).size !== scenes.length) {
            throw new Error('reorder_scenes requires every sceneId exactly once');
          }
          const map = new Map(scenes.map((s) => [s.id, s]));
          const next = ids.map((id) => {
            const s = map.get(id);
            if (!s) throw new Error(`Unknown sceneId in reorder: ${id}`);
            return s;
          });
          scenes = next;
          tracks = syncDerivedTracks(tracks, scenes);
          openEditor = true;
          results.push({ op: 'reorder_scenes', ok: true });
          break;
        }

        case 'add_scene': {
          const scene: Scene = {
            id: newId('scene'),
            title: String(raw.title || 'New scene').trim() || 'New scene',
            caption: String(raw.caption || ''),
            duration: clampDuration(raw.duration, 6),
            image: photos.earth,
          };
          if (raw.afterSceneId) {
            const idx = scenes.findIndex((s) => s.id === raw.afterSceneId);
            if (idx < 0) throw new Error(`afterSceneId not found: ${raw.afterSceneId}`);
            scenes = [...scenes.slice(0, idx + 1), scene, ...scenes.slice(idx + 1)];
          } else {
            scenes = [...scenes, scene];
          }
          selectedSceneId = scene.id;
          tracks = syncDerivedTracks(tracks, scenes);
          openEditor = true;
          results.push({ op: 'add_scene', ok: true, detail: scene.id });
          break;
        }

        case 'delete_scene': {
          if (scenes.length <= 1) throw new Error('Cannot delete the only scene');
          ensureScene(raw.sceneId);
          scenes = scenes.filter((s) => s.id !== raw.sceneId);
          if (selectedSceneId === raw.sceneId) selectedSceneId = scenes[0].id;
          tracks = tracks.map((t) => ({
            ...t,
            clips: t.clips.filter((c) => c.sceneId !== raw.sceneId && c.id !== raw.sceneId),
          }));
          tracks = syncDerivedTracks(tracks, scenes);
          openEditor = true;
          results.push({ op: 'delete_scene', ok: true, detail: raw.sceneId });
          break;
        }

        case 'split_scene': {
          const scene = ensureScene(raw.sceneId);
          const at = Number(raw.at);
          if (!Number.isFinite(at) || at <= 0.4 || at >= scene.duration - 0.4) {
            throw new Error(`split_scene.at must be inside (0.4 … duration-0.4); duration=${scene.duration}`);
          }
          const leftDur = Math.round(at * 10) / 10;
          const rightDur = Math.round((scene.duration - at) * 10) / 10;
          const right: Scene = {
            id: newId('scene'),
            title: `${scene.title} (cont.)`,
            caption: scene.caption,
            duration: rightDur,
            image: scene.image,
          };
          scenes = scenes.flatMap((s) =>
            s.id === scene.id ? [{ ...s, duration: leftDur }, right] : [s],
          );
          selectedSceneId = right.id;
          tracks = syncDerivedTracks(tracks, scenes);
          openEditor = true;
          results.push({ op: 'split_scene', ok: true, detail: `${scene.id} → ${right.id}` });
          break;
        }

        case 'upsert_clip': {
          if (!isTrackId(raw.trackId)) throw new Error(`Unknown trackId: ${raw.trackId}`);
          if (raw.trackId === 'scenes') throw new Error('Use scene ops for the Scenes track');
          const track = tracks.find((t) => t.id === raw.trackId);
          if (!track) throw new Error(`Track not found: ${raw.trackId}`);
          const total = totalDuration(scenes);
          const clip: TimelineClip = {
            id: String(raw.clip.id || newId(`clip-${raw.trackId}`)),
            label: String(raw.clip.label || 'Clip').trim() || 'Clip',
            start: clampTime(raw.clip.start, Math.max(total, 0.001)),
            duration: Math.max(0.5, Math.min(120, Number(raw.clip.duration) || 1)),
            sceneId: raw.clip.sceneId ? String(raw.clip.sceneId) : undefined,
            image: raw.clip.image ? String(raw.clip.image) : undefined,
            video: raw.clip.video ? String(raw.clip.video) : undefined,
          };
          const idx = track.clips.findIndex((c) => c.id === clip.id);
          const nextClips =
            idx >= 0 ? track.clips.map((c, i) => (i === idx ? { ...c, ...clip } : c)) : [...track.clips, clip];
          tracks = tracks.map((t) => (t.id === raw.trackId ? { ...t, clips: nextClips } : t));
          openEditor = true;
          results.push({ op: 'upsert_clip', ok: true, detail: `${raw.trackId}/${clip.id}` });
          break;
        }

        case 'update_clip': {
          if (!isTrackId(raw.trackId)) throw new Error(`Unknown trackId: ${raw.trackId}`);
          const track = tracks.find((t) => t.id === raw.trackId);
          if (!track) throw new Error(`Track not found: ${raw.trackId}`);
          const clip = track.clips.find((c) => c.id === raw.clipId);
          if (!clip) throw new Error(`Clip not found: ${raw.clipId}`);
          const total = totalDuration(scenes);
          tracks = tracks.map((t) =>
            t.id !== raw.trackId
              ? t
              : {
                  ...t,
                  clips: t.clips.map((c) =>
                    c.id === raw.clipId
                      ? {
                          ...c,
                          label: raw.label != null ? String(raw.label) : c.label,
                          start: raw.start != null ? clampTime(raw.start, Math.max(total, 0.001)) : c.start,
                          duration:
                            raw.duration != null
                              ? Math.max(0.5, Math.min(120, Number(raw.duration) || c.duration))
                              : c.duration,
                        }
                      : c,
                  ),
                },
          );
          openEditor = true;
          results.push({ op: 'update_clip', ok: true, detail: raw.clipId });
          break;
        }

        case 'delete_clip': {
          if (!isTrackId(raw.trackId)) throw new Error(`Unknown trackId: ${raw.trackId}`);
          if (raw.trackId === 'scenes') throw new Error('Use delete_scene for the Scenes track');
          const track = tracks.find((t) => t.id === raw.trackId);
          if (!track) throw new Error(`Track not found: ${raw.trackId}`);
          if (!track.clips.some((c) => c.id === raw.clipId)) throw new Error(`Clip not found: ${raw.clipId}`);
          tracks = tracks.map((t) =>
            t.id === raw.trackId ? { ...t, clips: t.clips.filter((c) => c.id !== raw.clipId) } : t,
          );
          openEditor = true;
          results.push({ op: 'delete_clip', ok: true, detail: raw.clipId });
          break;
        }

        default:
          results.push({ op: (raw as { op?: string }).op || 'unknown', ok: false, detail: 'Unknown op' });
      }
    } catch (err) {
      results.push({
        op: raw.op,
        ok: false,
        detail: err instanceof Error ? err.message : 'op failed',
      });
    }
  }

  return {
    state: {
      scenes,
      selectedSceneId,
      playhead: clampTime(playhead, Math.max(totalDuration(scenes), 0.001)),
      tracks: syncDerivedTracks(tracks, scenes),
    },
    results,
    openEditor,
  };
}

export function parseTimelineOps(raw: unknown): TimelineOp[] {
  if (!Array.isArray(raw)) throw new Error('ops must be an array');
  return raw.map((item, i) => {
    if (!item || typeof item !== 'object') throw new Error(`ops[${i}] must be an object`);
    const op = String((item as { op?: unknown }).op || '');
    if (!op) throw new Error(`ops[${i}] missing op`);
    return item as TimelineOp;
  });
}
