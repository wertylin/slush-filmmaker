export type Block = {
  id: string;
  key: string;
  image: string;
  description: string;
  caption: string;
  duration: number;
  sortOrder: number;
};

export async function fetchBlocks(): Promise<Block[]> {
  const res = await fetch('/api/blocks');
  if (!res.ok) return [];
  const data = (await res.json()) as { blocks: Block[] };
  return Array.isArray(data.blocks) ? data.blocks : [];
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

/** Keep Assets DB in sync when a scene still is replaced (match by description = title). */
export async function syncBlockImage(description: string, image: string) {
  const blocks = await fetchBlocks();
  const hit = blocks.find((b) => b.description === description);
  if (hit) {
    await fetch(`/api/blocks/${hit.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
    });
    return;
  }
  await fetch('/api/blocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, description }),
  });
}
