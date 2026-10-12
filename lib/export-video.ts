export type ExportScene = {
  title: string;
  caption: string;
  image: string;
  duration: number;
};

export type ExportProgress = {
  phase: 'loading' | 'encoding' | 'done' | 'error';
  progress: number;
  message: string;
};

function pickMime(): { mimeType: string; ext: string } {
  const candidates = [
    { mimeType: 'video/webm;codecs=vp9', ext: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', ext: 'webm' },
    { mimeType: 'video/webm', ext: 'webm' },
    { mimeType: 'video/mp4', ext: 'mp4' },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: 'video/webm', ext: 'webm' };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src.slice(0, 80)}`));
    if (!src.startsWith('/') && !src.startsWith('blob:') && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = src;
  });
}

async function loadSceneImage(src: string): Promise<HTMLImageElement> {
  const raw = (src || '').trim();
  if (!raw) throw new Error('Scene has no image');
  if (raw.startsWith('/') || raw.startsWith('blob:') || raw.startsWith('data:')) {
    return loadImageElement(raw);
  }
  try {
    return await loadImageElement(raw);
  } catch {
    return loadImageElement(`/api/proxy-image?url=${encodeURIComponent(raw)}`);
  }
}

function coverDraw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  zoom = 1,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  scene: ExportScene,
  index: number,
  totalScenes: number,
  w: number,
  h: number,
  localT: number,
  duration: number,
) {
  const progress = duration > 0 ? Math.min(1, Math.max(0, localT / duration)) : 0;
  const zoom = 1 + progress * 0.06;

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, w, h);
  coverDraw(ctx, img, w, h, zoom);

  const grad = ctx.createLinearGradient(0, h * 0.45, 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const caption = (scene.caption || scene.title || '').trim();
  const line = caption.split('.').filter(Boolean)[0]?.trim() || scene.title;
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.round(h * 0.045)}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  wrapText(ctx, line.endsWith('.') ? line : `${line}.`, w * 0.06, h * 0.88, w * 0.7, h * 0.055);

  ctx.font = `700 ${Math.round(h * 0.022)}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(
    `SCENE ${String(index + 1).padStart(2, '0')} · ${(scene.title || 'SCENE').toUpperCase()}`,
    w * 0.06,
    h * 0.94,
  );

  void totalScenes;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 2);
  shown.forEach((l, i) => {
    ctx.fillText(l, x, y - (shown.length - 1 - i) * lineHeight);
  });
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'founder-film'
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Client-side export: scene stills + captions → WebM/MP4 via Canvas + MediaRecorder.
 * Duration matches timeline scene durations (realtime encode).
 */
export async function exportFilmVideo(opts: {
  project: string;
  scenes: ExportScene[];
  width?: number;
  height?: number;
  fps?: number;
  onProgress?: (p: ExportProgress) => void;
}): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const scenes = opts.scenes.filter((s) => s.image && Number(s.duration) > 0);
  if (!scenes.length) throw new Error('No scenes with images to export');

  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const fps = opts.fps ?? 30;
  const { mimeType, ext } = pickMime();
  const filename = `${slugify(opts.project)}.${ext}`;

  opts.onProgress?.({ phase: 'loading', progress: 0.02, message: 'Loading stills…' });

  const images: HTMLImageElement[] = [];
  for (let i = 0; i < scenes.length; i++) {
    images.push(await loadSceneImage(scenes[i].image));
    opts.onProgress?.({
      phase: 'loading',
      progress: 0.05 + (0.2 * (i + 1)) / scenes.length,
      message: `Loading still ${i + 1}/${scenes.length}…`,
    });
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('MediaRecorder failed'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  const totalSec = scenes.reduce((n, s) => n + Math.max(0.5, Number(s.duration) || 1), 0);
  opts.onProgress?.({ phase: 'encoding', progress: 0.25, message: 'Encoding film…' });
  recorder.start(250);

  const started = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = (performance.now() - started) / 1000;
      if (elapsed >= totalSec) {
        // final frame
        let acc = 0;
        for (let i = 0; i < scenes.length; i++) {
          const dur = Math.max(0.5, Number(scenes[i].duration) || 1);
          if (acc + dur >= totalSec || i === scenes.length - 1) {
            drawFrame(ctx, images[i], scenes[i], i, scenes.length, width, height, dur, dur);
            break;
          }
          acc += dur;
        }
        opts.onProgress?.({ phase: 'encoding', progress: 0.95, message: 'Finalizing…' });
        resolve();
        return;
      }

      let acc = 0;
      let idx = 0;
      let local = elapsed;
      for (let i = 0; i < scenes.length; i++) {
        const dur = Math.max(0.5, Number(scenes[i].duration) || 1);
        if (elapsed < acc + dur) {
          idx = i;
          local = elapsed - acc;
          break;
        }
        acc += dur;
        idx = i;
        local = dur;
      }

      drawFrame(ctx, images[idx], scenes[idx], idx, scenes.length, width, height, local, Math.max(0.5, Number(scenes[idx].duration) || 1));
      opts.onProgress?.({
        phase: 'encoding',
        progress: 0.25 + 0.7 * Math.min(1, elapsed / totalSec),
        message: `Encoding scene ${idx + 1}/${scenes.length}…`,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Let the last frames flush into the recorder
  await new Promise((r) => setTimeout(r, 120));
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());

  const blob = await done;
  if (!blob.size) throw new Error('Export produced an empty file');

  opts.onProgress?.({ phase: 'done', progress: 1, message: 'Export ready' });
  return { blob, filename, mimeType };
}
