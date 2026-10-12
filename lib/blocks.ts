export type Block = {
  id: string;
  key: string;
  image: string;
  description: string;
  caption: string;
  duration: number;
  sortOrder: number;
  source?: string;
  modelKey?: string | null;
  prompt?: string | null;
  aspect?: string | null;
  refUrls?: string[];
  falRequestId?: string | null;
  /** Session / IndexedDB-backed video URL when available */
  video?: string | null;
  meta?: Record<string, unknown>;
};

const LOCAL_SOURCES_KEY = 'slush-asset-sources';

function isBrowser() {
  return typeof window !== 'undefined';
}

/** blob: dies on reload — never treat as a durable asset image. */
export function isDurableMediaUrl(url: string | null | undefined) {
  if (!url) return false;
  return (
    url.startsWith('data:') ||
    url.startsWith('https://') ||
    url.startsWith('http://') ||
    url.startsWith('/')
  );
}

function normalizeBlock(raw: Partial<Block> & { meta?: Record<string, unknown> }): Block | null {
  const image = String(raw.image || '');
  if (!image || !isDurableMediaUrl(image)) return null;
  const meta = (raw.meta && typeof raw.meta === 'object' ? raw.meta : {}) as Record<string, unknown>;
  const videoFromMeta = typeof meta.video === 'string' ? meta.video : null;
  const video = (typeof raw.video === 'string' ? raw.video : videoFromMeta) || null;
  return {
    id: String(raw.id || raw.key || ''),
    key: String(raw.key || raw.id || ''),
    image,
    description: String(raw.description || 'Asset'),
    caption: String(raw.caption || ''),
    duration: Math.max(1, Math.min(60, Number(raw.duration) || 6)),
    sortOrder: Number(raw.sortOrder) || 0,
    source: raw.source,
    modelKey: raw.modelKey ?? null,
    prompt: raw.prompt ?? null,
    aspect: raw.aspect ?? null,
    refUrls: Array.isArray(raw.refUrls) ? raw.refUrls.map(String) : [],
    falRequestId: raw.falRequestId ?? null,
    video: video && isDurableMediaUrl(video) ? video : video?.startsWith('blob:') ? video : null,
    meta,
  };
}

export function readLocalSources(): Block[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(LOCAL_SOURCES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const cleaned: Block[] = [];
    for (const row of parsed) {
      const b = normalizeBlock(row as Partial<Block>);
      if (b) cleaned.push(b);
    }
    // Drop dead blob: entries that used to break thumbnails after reload.
    if (cleaned.length !== parsed.length) {
      writeLocalSources(cleaned);
    }
    return cleaned;
  } catch {
    return [];
  }
}

export function writeLocalSources(blocks: Block[]) {
  if (!isBrowser()) return;
  try {
    const durable = blocks
      .map((b) => normalizeBlock(b))
      .filter((b): b is Block => Boolean(b))
      .map((b) => ({
        ...b,
        // Never write session blob: video into localStorage — IDB holds the bytes.
        video: b.video && isDurableMediaUrl(b.video) ? b.video : null,
      }));
    localStorage.setItem(LOCAL_SOURCES_KEY, JSON.stringify(durable.slice(0, 80)));
  } catch {
    /* quota / private mode */
  }
}

/** Template seed stills (`scene-1`…) — not library sources. */
export function isSeedSceneBlock(b: Pick<Block, 'key' | 'id'>) {
  const k = String(b.key || b.id || '');
  return /^scene-\d+$/i.test(k);
}

/** Merge remote + local; generated sources win on duplicate image/key. Drops template seed stills. */
export function mergeAssetLibrary(remote: Block[], local: Block[]): Block[] {
  const byKey = new Map<string, Block>();
  for (const b of remote) {
    if (isSeedSceneBlock(b)) continue;
    const n = normalizeBlock(b);
    if (n) byKey.set(n.key || n.id, n);
  }
  for (const b of local) {
    if (isSeedSceneBlock(b)) continue;
    const n = normalizeBlock(b);
    if (n) byKey.set(n.key || n.id, n);
  }
  return [...byKey.values()].sort((a, b) => b.sortOrder - a.sortOrder || a.description.localeCompare(b.description));
}

export async function fetchBlocks(): Promise<Block[]> {
  const res = await fetch('/api/blocks');
  if (!res.ok) return [];
  const data = (await res.json()) as { blocks: Block[] };
  const rows = Array.isArray(data.blocks) ? data.blocks : [];
  return rows
    .map((b) => normalizeBlock(b))
    .filter((b): b is Block => Boolean(b))
    .filter((b) => !isSeedSceneBlock(b));
}

/** Map DB blocks → Studio Scene shape (fallback ids if key missing). */
export function blocksToScenes(blocks: Block[]) {
  return blocks.map((b, i) => ({
    id: b.key || `scene-${i + 1}`,
    title: b.description,
    image: b.image,
    duration: Math.max(1, Math.min(60, Number(b.duration) || 6)),
    caption: b.caption || '',
  }));
}

function makeSourceKey() {
  return `source-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Build a local source card immediately (visible even if DB write fails). */
export function createLocalSource(input: {
  image: string;
  description: string;
  caption?: string;
  duration?: number;
  prompt?: string;
  source?: string;
  modelKey?: string;
  aspect?: string;
  refUrls?: string[];
  falRequestId?: string;
  video?: string;
  cacheId?: string;
}): Block {
  const key = makeSourceKey();
  const label =
    (input.prompt || '').trim().slice(0, 48) ||
    `Generated · ${input.description}`.slice(0, 80);
  const meta: Record<string, unknown> = {};
  if (input.video && isDurableMediaUrl(input.video)) meta.video = input.video;
  if (input.cacheId) meta.cacheId = input.cacheId;
  return {
    id: key,
    key,
    image: input.image,
    description: label,
    caption: input.caption || input.prompt || '',
    duration: Math.max(1, Math.min(60, Number(input.duration) || 6)),
    sortOrder: Date.now(),
    source: input.source || 'fal',
    modelKey: input.modelKey || null,
    prompt: input.prompt || null,
    aspect: input.aspect || null,
    refUrls: input.refUrls || [],
    falRequestId: input.falRequestId || null,
    video: input.video || null,
    meta,
  };
}

/**
 * Append a new visual source to the Assets library.
 * Always returns a local card; persists to API + localStorage when possible.
 * Never overwrites seed/scene slots.
 */
export async function addAssetSource(input: {
  image: string;
  description: string;
  caption?: string;
  duration?: number;
  prompt?: string;
  source?: string;
  modelKey?: string;
  aspect?: string;
  refUrls?: string[];
  falRequestId?: string;
  video?: string;
  cacheId?: string;
}): Promise<Block> {
  if (!isDurableMediaUrl(input.image)) {
    throw new Error('Asset image must be a durable URL (not blob:) — compress/upload first');
  }
  const local = createLocalSource(input);
  const existing = readLocalSources().filter((b) => b.key !== local.key && b.image !== local.image);
  writeLocalSources([local, ...existing]);

  const res = await fetch('/api/blocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: local.key,
      image: local.image,
      description: local.description,
      caption: local.caption,
      duration: local.duration,
      sortOrder: local.sortOrder,
      source: local.source || 'fal',
      modelKey: local.modelKey,
      prompt: local.prompt,
      aspect: local.aspect,
      refUrls: local.refUrls,
      falRequestId: local.falRequestId,
      meta: local.meta || {},
    }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) detail = err.error;
    } catch {
      /* ignore */
    }
    // Uploads must land in DB; fal/generated can stay local-only.
    if ((local.source || '') === 'upload') {
      throw new Error(`Could not save asset to DB — ${detail}`);
    }
    return local;
  }

  const data = (await res.json()) as { block?: Block };
  if (data.block) {
    const saved = normalizeBlock({
      ...data.block,
      video: local.video,
      meta: { ...(data.block.meta || {}), ...(local.meta || {}) },
    });
    if (saved) {
      const next = [saved, ...readLocalSources().filter((b) => b.key !== local.key && b.key !== saved.key)];
      writeLocalSources(next);
      return saved;
    }
  }

  return local;
}
