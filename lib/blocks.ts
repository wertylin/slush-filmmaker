export type Block = {
  id: string;
  key: string;
  image: string;
  description: string;
  caption: string;
  duration: number;
  sortOrder: number;
};

const LOCAL_SOURCES_KEY = 'slush-asset-sources';

function isBrowser() {
  return typeof window !== 'undefined';
}

export function readLocalSources(): Block[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(LOCAL_SOURCES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Block[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalSources(blocks: Block[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(LOCAL_SOURCES_KEY, JSON.stringify(blocks.slice(0, 80)));
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
    byKey.set(b.key || b.id, b);
  }
  for (const b of local) {
    if (isSeedSceneBlock(b)) continue;
    byKey.set(b.key || b.id, b);
  }
  return [...byKey.values()].sort((a, b) => b.sortOrder - a.sortOrder || a.description.localeCompare(b.description));
}

export async function fetchBlocks(): Promise<Block[]> {
  const res = await fetch('/api/blocks');
  if (!res.ok) return [];
  const data = (await res.json()) as { blocks: Block[] };
  const rows = Array.isArray(data.blocks) ? data.blocks : [];
  return rows.filter((b) => !isSeedSceneBlock(b));
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
}): Block {
  const key = makeSourceKey();
  const label =
    (input.prompt || '').trim().slice(0, 48) ||
    `Generated · ${input.description}`.slice(0, 80);
  return {
    id: key,
    key,
    image: input.image,
    description: label,
    caption: input.caption || input.prompt || '',
    duration: Math.max(1, Math.min(60, Number(input.duration) || 6)),
    sortOrder: Date.now(),
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
}): Promise<Block> {
  const local = createLocalSource(input);
  const existing = readLocalSources().filter((b) => b.key !== local.key && b.image !== local.image);
  writeLocalSources([local, ...existing]);

  try {
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
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { block?: Block };
      if (data.block) {
        const saved = data.block;
        const next = [saved, ...readLocalSources().filter((b) => b.key !== local.key && b.key !== saved.key)];
        writeLocalSources(next);
        return saved;
      }
    }
  } catch {
    /* keep local card */
  }

  return local;
}
