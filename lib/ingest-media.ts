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
          const w = video.videoWidth || 1280;
          const h = video.videoHeight || 720;
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
            0.92,
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

const DURABLE_IMAGE_MAX_BYTES = Math.floor(1.8 * 1024 * 1024);

/**
 * Prefer a durable data URL for Assets (localStorage / API).
 * Oversized / remote URLs stay as-is (blob = session-only).
 */
export async function durableImageUrl(imageUrl: string): Promise<string> {
  if (!imageUrl || imageUrl.startsWith('data:') || !imageUrl.startsWith('blob:')) return imageUrl;
  try {
    const blob = await fetch(imageUrl).then((r) => r.blob());
    if (blob.size > DURABLE_IMAGE_MAX_BYTES) return imageUrl;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not encode image'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return imageUrl;
  }
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
