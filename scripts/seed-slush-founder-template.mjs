/**
 * ALTER sf_templates + seed slush_founder fixed/slots from sf_blocks + buildInitialTracks.
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

function buildInitialTracks(scenes) {
  const total = scenes.reduce((n, s) => n + s.duration, 0);
  let t = 0;
  const timeline = scenes.map((s) => {
    const start = t;
    t += s.duration;
    return { ...s, start, end: t };
  });
  const caps = timeline.map((s) => ({
    id: `cap-${s.id}`,
    label: 'CC',
    start: s.start,
    duration: s.duration,
    sceneId: s.id,
  }));
  return TRACK_DEFS.map((def) => {
    if (def.id === 'scenes' || def.id === 'captions') {
      return { ...def, clips: def.id === 'captions' ? caps : [] };
    }
    const defaults = {
      founder: [{ id: 'clip-founder-1', label: 'Founder A-cam', start: Math.min(2, total * 0.08), duration: Math.min(18, total * 0.55) }],
      product: [{ id: 'clip-product-1', label: 'Product UI', start: Math.min(12, total * 0.38), duration: Math.min(9, total * 0.28) }],
      broll: [
        { id: 'clip-broll-1', label: 'City', start: Math.min(4, total * 0.12), duration: Math.min(6, total * 0.18) },
        { id: 'clip-broll-2', label: 'Crowd', start: Math.min(20, total * 0.62), duration: Math.min(7, total * 0.22) },
      ],
      titles: [{ id: 'clip-title-1', label: 'Open title', start: 0, duration: Math.min(5, total * 0.16) }],
      vo: [{ id: 'clip-vo-1', label: 'Founder VO', start: Math.min(1.5, total * 0.05), duration: Math.min(22, total * 0.7) }],
      music: [{ id: 'clip-music-1', label: 'Underscore', start: 0, duration: Math.max(total, 1) }],
      sfx: [{ id: 'clip-sfx-1', label: 'Hit', start: Math.min(15, total * 0.48), duration: 2 }],
    };
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
    project_title = COALESCE(project_title, 'Slush founder'),
    fixed = ${JSON.stringify(fixed)}::jsonb,
    slots = ${JSON.stringify(slots)}::jsonb,
    updated_at = now()
  WHERE key = 'slush_founder'
`;

const check = await sql`
  SELECT key, project_title,
    jsonb_array_length(fixed->'beats') AS beats,
    jsonb_typeof(slots->'captions') AS captions
  FROM sf_templates WHERE key = 'slush_founder'
`;
console.log('seeded', check[0]);
