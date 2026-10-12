import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env' });

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');

/** Slush founder arc: hook → problem → founder → product → ask (~60s). */
const rows = [
  {
    key: 'scene-1',
    description: 'Hook',
    image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=85',
    caption: 'Something had to change.',
    duration: 6,
    sortOrder: 1,
  },
  {
    key: 'scene-2',
    description: 'The problem',
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=85',
    caption: 'The old way was built for someone else.',
    duration: 12,
    sortOrder: 2,
  },
  {
    key: 'scene-3',
    description: 'The founder',
    image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=1000&q=85',
    caption: 'So we stopped waiting for permission.',
    duration: 14,
    sortOrder: 3,
  },
  {
    key: 'scene-4',
    description: 'The product',
    image: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?auto=format&fit=crop&w=1000&q=85',
    caption: 'We built the thing we wished existed.',
    duration: 16,
    sortOrder: 4,
  },
  {
    key: 'scene-5',
    description: 'The ask',
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=85',
    caption: 'This is only the first frame. Come build with us.',
    duration: 12,
    sortOrder: 5,
  },
];

const sql = neon(url);
for (const r of rows) {
  await sql`
    INSERT INTO sf_blocks (key, image, description, caption, duration, sort_order)
    VALUES (${r.key}, ${r.image}, ${r.description}, ${r.caption}, ${r.duration}, ${r.sortOrder})
    ON CONFLICT (key) DO UPDATE SET
      image = EXCLUDED.image,
      description = EXCLUDED.description,
      caption = EXCLUDED.caption,
      duration = EXCLUDED.duration,
      sort_order = EXCLUDED.sort_order,
      updated_at = now()
  `;
  console.log('upserted', r.key, '—', r.description);
}
