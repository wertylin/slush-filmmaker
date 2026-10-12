import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sfFalModels, type SfFalModel } from '@/lib/db/schema';

export type FalModelPublic = {
  key: string;
  endpoint: string;
  label: string;
  kind: string;
  costTier: string;
  bestFor: string;
  avoidFor: string;
  isDefault: boolean;
  capabilities: SfFalModel['capabilities'];
  requestProfile: string;
};

/** Hardcoded fallback if DB is empty / unreachable — matches seed. */
export const FALLBACK_FAL_MODELS: FalModelPublic[] = [
  {
    key: 'flux-schnell',
    endpoint: 'fal-ai/flux/schnell',
    label: 'FLUX Schnell',
    kind: 't2i',
    costTier: 'cheap',
    bestFor: 'Fast draft stills, moodboards, cheap iteration',
    avoidFor: 'Character consistency across scenes, final hero frames',
    isDefault: true,
    capabilities: { refs: false, aspect: true },
    requestProfile: 'flux',
  },
  {
    key: 'seedream-5-lite',
    endpoint: 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
    label: 'Seedream 5.0 Lite',
    kind: 't2i',
    costTier: 'cheap',
    bestFor: 'Volume drafts, multiple options, product/marketing frames',
    avoidFor: 'Native multi-person character lock without refs',
    isDefault: false,
    capabilities: { refs: false, aspect: true },
    requestProfile: 'seedream',
  },
  {
    key: 'flux-2-pro',
    endpoint: 'fal-ai/flux-2-pro',
    label: 'FLUX.2 Pro',
    kind: 't2i',
    costTier: 'standard',
    bestFor: 'Cinematic photoreal hero frames, founder-film look, production stills',
    avoidFor: 'Cheap bulk drafts (use flux-schnell or seedream)',
    isDefault: false,
    capabilities: { refs: false, aspect: true },
    requestProfile: 'flux2',
  },
  {
    key: 'nano-banana-2',
    endpoint: 'fal-ai/nano-banana-2',
    label: 'Nano Banana 2',
    kind: 't2i',
    costTier: 'premium',
    bestFor: 'Same founder/character across scenes, semantic composition, ref-guided stills',
    avoidFor: 'Cheapest one-off drafts',
    isDefault: false,
    capabilities: { refs: true, maxRefs: 14, aspect: true },
    requestProfile: 'nano_banana',
  },
];

function toPublic(row: SfFalModel): FalModelPublic {
  return {
    key: row.key,
    endpoint: row.endpoint,
    label: row.label,
    kind: row.kind,
    costTier: row.costTier,
    bestFor: row.bestFor,
    avoidFor: row.avoidFor || '',
    isDefault: row.isDefault,
    capabilities: row.capabilities || {},
    requestProfile: row.requestProfile,
  };
}

export async function listEnabledFalModels(): Promise<FalModelPublic[]> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(sfFalModels)
      .where(eq(sfFalModels.enabled, true))
      .orderBy(asc(sfFalModels.sortOrder), asc(sfFalModels.key));
    if (!rows.length) return FALLBACK_FAL_MODELS;
    return rows.map(toPublic);
  } catch {
    return FALLBACK_FAL_MODELS;
  }
}

export async function resolveFalModel(modelKey?: string | null): Promise<FalModelPublic> {
  const models = await listEnabledFalModels();
  const key = (modelKey || '').trim();
  if (key) {
    const hit = models.find((m) => m.key === key);
    if (!hit) throw new Error(`Unknown or disabled fal model: ${key}`);
    return hit;
  }
  return models.find((m) => m.isDefault) || models[0] || FALLBACK_FAL_MODELS[0];
}

/** Build fal.run JSON body from request_profile. */
export function buildFalInput(
  model: FalModelPublic,
  opts: { prompt: string; aspect?: string; refUrls?: string[] },
): Record<string, unknown> {
  const prompt = opts.prompt.slice(0, 1500);
  const aspect = opts.aspect || '16:9';
  const refs = (opts.refUrls || []).filter(Boolean).slice(0, model.capabilities?.maxRefs || 14);

  switch (model.requestProfile) {
    case 'flux2':
      return {
        prompt,
        image_size: aspectToFluxSize(aspect),
        enable_safety_checker: true,
        output_format: 'jpeg',
      };
    case 'nano_banana':
      return {
        prompt,
        aspect_ratio: aspect,
        output_format: 'png',
        ...(refs.length ? { image_urls: refs } : {}),
      };
    case 'seedream':
      return {
        prompt,
        image_size: 'auto_2K',
      };
    case 'flux':
    default:
      return {
        prompt,
        image_size: aspectToFluxSize(aspect),
        num_images: 1,
        enable_safety_checker: true,
      };
  }
}

function aspectToFluxSize(aspect: string): string {
  const a = aspect.trim();
  if (a === '1:1' || a === 'square') return 'square_hd';
  if (a === '9:16' || a === 'portrait') return 'portrait_16_9';
  if (a === '4:3') return 'landscape_4_3';
  return 'landscape_16_9';
}

/** Pull image URL from heterogeneous fal response shapes. */
export function extractFalImageUrl(data: Record<string, unknown>): string | null {
  const images = data.images;
  if (Array.isArray(images) && images[0] && typeof images[0] === 'object') {
    const url = (images[0] as { url?: string }).url;
    if (url) return url;
  }
  const image = data.image;
  if (image && typeof image === 'object') {
    const url = (image as { url?: string }).url;
    if (url) return url;
  }
  if (typeof data.image_url === 'string') return data.image_url;
  return null;
}
