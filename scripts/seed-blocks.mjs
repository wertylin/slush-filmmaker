import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env' });

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');

/** Default Assets “building blocks” — mirrors founder template scenes. */
const rows = [
  {
    key: 'scene-1',
    description: 'The spark',
    image: 'https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?auto=format&fit=crop&w=1200&q=85',
    caption: 'Every great company starts with a question.',
    duration: 6,
    sortOrder: 1,
  },
  {
    key: 'scene-2',
    description: 'The founder',
    image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=1000&q=85',
    caption: 'What if we could build something better?',
    duration: 8,
    sortOrder: 2,
  },
  {
    key: 'scene-3',
    description: 'The people',
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=85',
    caption: 'A shared belief. An extraordinary team.',
    duration: 7,
    sortOrder: 3,
  },
  {
    key: 'scene-4',
    description: 'The vision',
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=85',
    caption: 'Built for a world that’s ready for more.',
    duration: 6,
    sortOrder: 4,
  },
  {
    key: 'scene-5',
    description: 'The next chapter',
    image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=85',
    caption: 'And this is only the beginning.',
    duration: 5,
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
