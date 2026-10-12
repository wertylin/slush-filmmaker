export type TemplateCard = {
  id: string;
  name: string;
  category: string;
  time: string;
  image: string;
  headline: string;
  description: string;
  locked: boolean;
};

export type TemplateBeat = {
  id: string;
  title: string;
  duration: number;
};

export type TemplateFixed = {
  beats: TemplateBeat[];
  tracks: unknown[];
  style?: { aspect?: string; transition?: string };
};

export type TemplateSlots = {
  captions: Record<string, string>;
  images: Record<string, string>;
};

export type TemplateSeed = TemplateCard & {
  projectTitle: string;
  fixed: TemplateFixed;
  slots: TemplateSlots;
};

export type MergedTemplateScene = {
  id: string;
  title: string;
  duration: number;
  caption: string;
  image: string;
};

export type MergedTemplate = {
  templateId: string;
  project: string;
  scenes: MergedTemplateScene[];
  tracks: unknown[];
  style?: TemplateFixed['style'];
};

const FOUNDER_IMAGE = '/images/slush-founder.jpg';

/** Classic founder-film arc: hook → problem → founder → product → ask (~60s). */
export const FALLBACK_BEATS: TemplateBeat[] = [
  { id: 'scene-1', title: 'Hook', duration: 6 },
  { id: 'scene-2', title: 'The problem', duration: 12 },
  { id: 'scene-3', title: 'The founder', duration: 14 },
  { id: 'scene-4', title: 'The product', duration: 16 },
  { id: 'scene-5', title: 'The ask', duration: 12 },
];

export const FALLBACK_SLOTS: TemplateSlots = {
  captions: {
    'scene-1': 'Something had to change.',
    'scene-2': 'The old way was built for someone else.',
    'scene-3': 'So we stopped waiting for permission.',
    'scene-4': 'We built the thing we wished existed.',
    'scene-5': 'This is only the first frame. Come build with us.',
  },
  images: {
    'scene-1': 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=85',
    'scene-2': 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=85',
    'scene-3': 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=1000&q=85',
    'scene-4': 'https://images.unsplash.com/photo-1551650975-87deedd944c3?auto=format&fit=crop&w=1000&q=85',
    'scene-5': 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=85',
  },
};

export const FALLBACK_TEMPLATES: TemplateCard[] = [
  {
    id: 'slush_founder',
    name: 'Slush founder',
    category: 'STORY',
    time: '~60 SEC',
    image: FOUNDER_IMAGE,
    headline: 'IT STARTS\nWITH YOU.',
    description: 'Hook → problem → founder → product → ask. The why behind what you’re building.',
    locked: false,
  },
];

let cached: TemplateCard[] = FALLBACK_TEMPLATES;
let cachedAt = 0;
let inflight: Promise<TemplateCard[]> | null = null;
const TEMPLATES_TTL_MS = 60_000;

export function getCachedTemplates() {
  return cached;
}

export function isTemplateAvailable(id: string, list: TemplateCard[] = cached) {
  if (id === 'founder') return true; // legacy alias → slush_founder
  return list.some((t) => t.id === id && !t.locked);
}

export function resolveTemplateId(id?: string, list: TemplateCard[] = cached) {
  if (id && isTemplateAvailable(id, list)) {
    return id === 'founder' ? 'slush_founder' : id;
  }
  const open = list.find((t) => !t.locked);
  return open?.id || 'slush_founder';
}

export function mergeTemplateSeed(
  fixed: TemplateFixed | null | undefined,
  slots: TemplateSlots | null | undefined,
  meta?: { templateId?: string; projectTitle?: string; name?: string },
): MergedTemplate {
  const beats = Array.isArray(fixed?.beats) && fixed!.beats.length ? fixed!.beats : FALLBACK_BEATS;
  const captions = slots?.captions || FALLBACK_SLOTS.captions;
  const images = slots?.images || FALLBACK_SLOTS.images;
  const scenes: MergedTemplateScene[] = beats.map((b) => ({
    id: b.id,
    title: b.title,
    duration: Math.max(1, Math.min(60, Number(b.duration) || 6)),
    caption: captions[b.id] ?? '',
    image: images[b.id] || FOUNDER_IMAGE,
  }));
  const tracks = Array.isArray(fixed?.tracks) ? fixed!.tracks : [];
  return {
    templateId: meta?.templateId || 'slush_founder',
    project: meta?.projectTitle || meta?.name || 'Slush founder',
    scenes,
    tracks,
    style: fixed?.style,
  };
}

export async function fetchTemplates(opts?: { force?: boolean }): Promise<TemplateCard[]> {
  const warm = Date.now() - cachedAt < TEMPLATES_TTL_MS && cachedAt > 0;
  if (!opts?.force && warm) return cached;
  if (!opts?.force && inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch('/api/templates');
      if (!res.ok) return cached;
      const data = (await res.json()) as { templates?: TemplateCard[] };
      if (Array.isArray(data.templates) && data.templates.length) {
        cached = data.templates;
        cachedAt = Date.now();
        return cached;
      }
    } catch {
      /* keep cache */
    }
    return cached;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export async function fetchTemplateSeed(id?: string): Promise<MergedTemplate> {
  const key = resolveTemplateId(id);
  try {
    const res = await fetch(`/api/templates/${encodeURIComponent(key)}`);
    if (res.ok) {
      const data = (await res.json()) as {
        template: {
          id: string;
          name: string;
          projectTitle?: string | null;
          fixed?: TemplateFixed | null;
          slots?: TemplateSlots | null;
        };
      };
      const t = data.template;
      return mergeTemplateSeed(t.fixed, t.slots, {
        templateId: t.id,
        projectTitle: t.projectTitle || undefined,
        name: t.name,
      });
    }
  } catch {
    /* fall through */
  }
  const card = getCachedTemplates().find((t) => t.id === key) || FALLBACK_TEMPLATES[0];
  return mergeTemplateSeed(
    {
      beats: FALLBACK_BEATS,
      tracks: [],
      style: { aspect: '16:9', transition: 'Fade' },
    },
    FALLBACK_SLOTS,
    { templateId: key, projectTitle: card.name, name: card.name },
  );
}

/** Canonical seed payload for DB upsert / admin sync. */
export function getFounderTemplateSeedPayload() {
  return {
    key: 'slush_founder',
    name: 'Slush founder',
    category: 'STORY',
    time: '~60 SEC',
    image: FOUNDER_IMAGE,
    headline: 'IT STARTS\nWITH YOU.',
    description: 'Hook → problem → founder → product → ask. The why behind what you’re building.',
    locked: false,
    projectTitle: 'Slush founder',
    fixed: {
      beats: FALLBACK_BEATS,
      tracks: [] as unknown[],
      style: { aspect: '16:9', transition: 'Fade' },
    },
    slots: FALLBACK_SLOTS,
  };
}
