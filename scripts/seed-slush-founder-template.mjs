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

/** Empty track shells + captions from scenes — no fake A/V clips. */
function buildInitialTracks(scenes) {
  let t = 0;
  const caps = scenes.map((s) => {
    const start = t;
    t += s.duration;
    return {
      id: `cap-${s.id}`,
      label: 'CC',
      start,
      duration: s.duration,
      sceneId: s.id,
    };
  });

  return TRACK_DEFS.map((def) => {
    if (def.id === 'captions') return { ...def, clips: caps };
    return { ...def, clips: [] };
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
