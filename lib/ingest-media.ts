export type IngestedMedia = {
  kind: 'image' | 'video';
  /** Poster / still used for scene.image, Assets, export */
  imageUrl: string;
  /** Present for video — preview can play this */
  videoUrl?: string;
  fileName: string;
  durationHint?: number;
};

/** Drag payload from Assets panel → Editor preview / timeline. */
export const SLUSH_ASSET_MIME = 'application/x-slush-asset';

export type SlushAssetPayload = {
  image: string;
  description: string;
  duration?: number;
  key?: string;
  video?: string;
};

export function parseSlushAssetDrag(dt: DataTransfer): SlushAssetPayload | null {
  try {
    const raw = dt.getData(SLUSH_ASSET_MIME) || dt.getData('text/plain');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SlushAssetPayload>;
    if (!parsed.image || typeof parsed.image !== 'string') return null;
    return {
      image: parsed.image,
      description: typeof parsed.description === 'string' ? parsed.description : 'Asset',
      duration: typeof parsed.duration === 'number' ? parsed.duration : undefined,
      key: typeof parsed.key === 'string' ? parsed.key : undefined,
      video: typeof parsed.video === 'string' ? parsed.video : undefined,
    };
  } catch {
    return null;
  }
}

export function isSlushAssetDrag(dt: DataTransfer) {
  return Array.from(dt.types).includes(SLUSH_ASSET_MIME);
}

function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(file.name);
}

function isVideoFile(file: File) {
  return file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name);
}

function captureVideoPoster(videoUrl: string): Promise<{ posterUrl: string; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    const fail = (msg: string) => {
      cleanup();
      reject(new Error(msg));
    };

    const cleanup = () => {
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    };

    video.onerror = () => fail('Could not read video file');

    video.onloadeddata = () => {
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 6;
      const seekTo = Math.min(0.1, Math.max(0, dur * 0.02));
      const snap = () => {
        try {
          const vw = video.videoWidth || 1280;
          const vh = video.videoHeight || 720;
          const scale = Math.min(1, 960 / Math.max(vw, vh));
          const w = Math.max(1, Math.round(vw * scale));
          const h = Math.max(1, Math.round(vh * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return fail('Canvas unavailable');
          ctx.drawImage(video, 0, 0, w, h);
          canvas.toBlob(
            (blob) => {
              if (!blob) return fail('Poster capture failed');
              const posterUrl = URL.createObjectURL(blob);
              cleanup();
              resolve({ posterUrl, duration: dur });
            },
            'image/jpeg',
            0.72,
          );
        } catch (e) {
          fail(e instanceof Error ? e.message : 'Poster capture failed');
        }
      };

      if (seekTo > 0 && video.seekable.length) {
        video.onseeked = snap;
        try {
          video.currentTime = seekTo;
        } catch {
          snap();
        }
      } else {
        snap();
      }
    };
  });
}

/** Pick first usable image/video from a FileList / File[]. */
export function pickMediaFile(files: FileList | File[] | null | undefined): File | null {
  return pickMediaFiles(files)[0] || null;
}

/** All usable image/video files from a FileList / File[]. */
export function pickMediaFiles(files: FileList | File[] | null | undefined): File[] {
  if (!files || !files.length) return [];
  return Array.from(files).filter((f) => isImageFile(f) || isVideoFile(f));
}

const DURABLE_MAX_EDGE = 960;
const DURABLE_JPEG_QUALITY = 0.72;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not encode image'));
    reader.readAsDataURL(blob);
  });
}

/** Downscale + JPEG so Assets can persist in Postgres / localStorage (never leave blob:). */
export async function compressImageToDataUrl(source: Blob | string, maxEdge = DURABLE_MAX_EDGE): Promise<string> {
  const blob =
    typeof source === 'string'
      ? await fetch(source).then((r) => {
          if (!r.ok) throw new Error('Could not read image');
          return r.blob();
        })
      : source;

  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const out = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Compress failed'))), 'image/jpeg', DURABLE_JPEG_QUALITY);
    });
    return blobToDataUrl(out);
  } finally {
    bitmap.close();
  }
}

/**
 * Prefer a durable data URL for Assets (localStorage / API).
 * blob: / File must become data: — never persist session-only blob URLs.
 */
export async function durableImageUrl(imageUrl: string): Promise<string> {
  if (!imageUrl) return imageUrl;
  if (imageUrl.startsWith('data:')) return imageUrl;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('/')) {
    return imageUrl;
  }
  if (!imageUrl.startsWith('blob:')) return imageUrl;
  try {
    return await compressImageToDataUrl(imageUrl);
  } catch {
    throw new Error('Could not persist media preview — try a smaller file');
  }
}

/** Image File → durable data URL (skips intermediate blob URL). */
export async function durableImageFromFile(file: File): Promise<string> {
  return compressImageToDataUrl(file);
}

/**
 * Turn a local image/video file into object URLs for the editor.
 * Video → poster still (scene.image) + videoUrl for preview playback.
 */
export async function ingestMediaFile(file: File): Promise<IngestedMedia> {
  if (isImageFile(file)) {
    return {
      kind: 'image',
      imageUrl: URL.createObjectURL(file),
      fileName: file.name,
    };
  }
  if (isVideoFile(file)) {
    const videoUrl = URL.createObjectURL(file);
    const { posterUrl, duration } = await captureVideoPoster(videoUrl);
    return {
      kind: 'video',
      imageUrl: posterUrl,
      videoUrl,
      fileName: file.name,
      durationHint: Math.max(1, Math.min(60, Math.round(duration) || 6)),
    };
  }
  throw new Error('Drop an image or video file');
}
