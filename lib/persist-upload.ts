import { addAssetSource, type Block } from '@/lib/blocks';
import { durableImageUrl, ingestMediaFile, type IngestedMedia } from '@/lib/ingest-media';
import { cacheMediaBlob, readMediaBlob } from '@/lib/media-cache';

function makeCacheId() {
  return `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Ingest local file → durable poster in DB + optional IndexedDB video bytes. */
export async function persistUploadedFile(file: File): Promise<{ media: IngestedMedia; source: Block }> {
  const media = await ingestMediaFile(file);
  const image = await durableImageUrl(media.imageUrl);
  const label = media.fileName.replace(/\.[^.]+$/, '') || media.fileName;
  let cacheId: string | undefined;
  if (media.kind === 'video' && media.videoUrl) {
    cacheId = makeCacheId();
    await cacheMediaBlob(cacheId, file);
  }
  const source = await addAssetSource({
    image,
    description: label,
    caption: media.kind === 'video' ? `Uploaded video · ${media.fileName}` : `Uploaded · ${media.fileName}`,
    duration: media.durationHint,
    prompt: label,
    source: 'upload',
    video: media.videoUrl,
    cacheId,
  });
  return {
    media: {
      ...media,
      imageUrl: image,
      videoUrl: source.video || media.videoUrl,
    },
    source: { ...source, video: media.videoUrl || source.video },
  };
}

/** Restore blob: video URLs from IndexedDB after reload. */
export async function hydrateCachedVideos(blocks: Block[]): Promise<Block[]> {
  return Promise.all(
    blocks.map(async (b) => {
      if (b.video?.startsWith('blob:')) return b;
      const cacheId = typeof b.meta?.cacheId === 'string' ? b.meta.cacheId : null;
      if (!cacheId) return b;
      try {
        const blob = await readMediaBlob(cacheId);
        if (!blob) return b;
        return { ...b, video: URL.createObjectURL(blob) };
      } catch {
        return b;
      }
    }),
  );
}
