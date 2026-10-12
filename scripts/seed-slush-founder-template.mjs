/**
 * Seed slush_founder fixed/slots from sf_blocks + scene-aligned tracks.
 * Run: node scripts/seed-slush-founder-template.mjs
 */
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env' });

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');
const sql = neon(url);

const TRACK_DEFS = [
  { id: 'scenes', label: 'Scenes', color: 'var(--red)' },
  { id: 'founder', label: 'Founder Video', color: '#3b82f6' },
  { id: 'product', label: 'Product Screens', color: '#22c55e' },
  { id: 'broll', label: 'B-roll', color: '#eab308' },
  { id: 'titles', label: 'Titles', color: '#f97316' },
  { id: 'vo', label: 'Voiceover', color: '#a855f7' },
  { id: 'music', label: 'Music', color: '#14b8a6' },
  { id: 'sfx', label: 'SFX', color: '#64748b' },
  { id: 'captions', label: 'Captions', color: '#8b5cf6' },
];

/** Mirror of components/timeline.ts buildInitialTracks — founder arc by index. */
function buildInitialTracks(scenes) {
  let t = 0;
  const placed = scenes.map((s) => {
    const start = t;
    t += s.duration;
    return { ...s, start, end: t };
  });
  const total = Math.max(1, t);
  const at = (i) => placed[i] || placed[placed.length - 1];
  const caps = placed.map((s) => ({
    id: `cap-${s.id}`,
    label: 'CC',
    start: s.start,
    duration: s.duration,
    sceneId: s.id,
  }));

  const hook = at(0);
  const problem = at(1);
  const founder = at(2);
  const product = at(3);
  const ask = at(Math.min(4, placed.length - 1));

  const defaults = {
    founder: [
      {
        id: 'clip-founder-acam',
        label: 'Founder A-cam',
        start: founder.start,
        duration: founder.duration + Math.min(2, ask.duration * 0.25),
        sceneId: founder.id,
      },
      {
        id: 'clip-founder-close',
        label: 'Founder close',
        start: ask.start + ask.duration * 0.15,
        duration: Math.max(3, ask.duration * 0.55),
        sceneId: ask.id,
      },
    ],
    product: [
      {
        id: 'clip-product-ui',
        label: 'Product UI',
        start: product.start + 0.4,
        duration: Math.max(4, product.duration - 0.8),
        sceneId: product.id,
      },
    ],
    broll: [
      {
        id: 'clip-broll-world',
        label: 'Broken world',
        start: problem.start,
        duration: problem.duration,
        sceneId: problem.id,
      },
      {
        id: 'clip-broll-crowd',
        label: 'Stage / crowd',
        start: ask.start,
        duration: ask.duration,
        sceneId: ask.id,
      },
    ],
    titles: [
      {
        id: 'clip-title-open',
        label: 'Open title',
        start: hook.start,
        duration: Math.min(hook.duration, 4),
        sceneId: hook.id,
      },
      {
        id: 'clip-title-end',
        label: 'End card',
        start: ask.start + Math.max(0, ask.duration - 4),
        duration: Math.min(4, ask.duration),
        sceneId: ask.id,
      },
    ],
    vo: [
      {
        id: 'clip-vo-arc',
        label: 'Founder VO',
        start: Math.min(0.6, total * 0.02),
        duration: Math.max(total - 1.2, 8),
      },
    ],
    music: [{ id: 'clip-music-1', label: 'Underscore', start: 0, duration: total }],
    sfx: [
      {
        id: 'clip-sfx-turn',
        label: 'Turn hit',
        start: Math.max(0, founder.start - 0.15),
        duration: 1.2,
      },
      {
        id: 'clip-sfx-resolve',
        label: 'Resolve hit',
        start: Math.max(0, ask.start - 0.1),
        duration: 1.4,
      },
    ],
  };

  return TRACK_DEFS.map((def) => {
    if (def.id === 'scenes') return { ...def, clips: [] };
    if (def.id === 'captions') return { ...def, clips: caps };
    return { ...def, clips: defaults[def.id] || [] };
  });
}

await sql`
  ALTER TABLE sf_templates
    ADD COLUMN IF NOT EXISTS project_title text,
    ADD COLUMN IF NOT EXISTS fixed jsonb,
    ADD COLUMN IF NOT EXISTS slots jsonb
`;

const blocks = await sql`
  SELECT key, description, caption, duration, image
  FROM sf_blocks
  ORDER BY sort_order ASC, created_at ASC
`;

if (!blocks.length) throw new Error('sf_blocks empty — seed blocks first');

const beats = blocks.map((b) => ({
  id: b.key,
  title: b.description,
  duration: Number(b.duration) || 6,
}));
const captions = Object.fromEntries(blocks.map((b) => [b.key, b.caption || '']));
const images = Object.fromEntries(blocks.map((b) => [b.key, b.image]));
const scenesForTracks = beats.map((b) => ({ ...b, image: images[b.id], caption: captions[b.id] }));
const tracks = buildInitialTracks(scenesForTracks);

const fixed = {
  beats,
  tracks,
  style: { aspect: '16:9', transition: 'Fade' },
};
const slots = { captions, images };

await sql`
  UPDATE sf_templates
  SET
    name = 'Slush founder',
    time = '~60 SEC',
    description = 'Hook → problem → founder → product → ask. The why behind what you’re building.',
    project_title = 'Slush founder',
    fixed = ${JSON.stringify(fixed)}::jsonb,
    slots = ${JSON.stringify(slots)}::jsonb,
    updated_at = now()
  WHERE key = 'slush_founder'
`;

const check = await sql`
  SELECT key, project_title, time,
    jsonb_array_length(fixed->'beats') AS beats,
    fixed->'beats' AS beat_titles
  FROM sf_templates WHERE key = 'slush_founder'
`;
console.log('seeded', JSON.stringify(check[0], null, 2));
