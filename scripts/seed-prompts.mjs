import { readFileSync } from 'fs';
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env' });

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');

const sophieSrc = readFileSync(new URL('../prompts/sophie.ts', import.meta.url), 'utf8');
const system = sophieSrc.match(/export const SOPHIE_SYSTEM_PROMPT = `([\s\S]*?)`;/)?.[1];
const starter = sophieSrc.match(/export const SOPHIE_STARTER =\s*\n?\s*'([\s\S]*?)';/)?.[1];
if (!system || !starter) throw new Error('could not parse prompts/sophie.ts');

const storyboard = `You write founder-film storyboards. Return JSON only:
{
  "projectTitle": "short project title",
  "diffSummary": "1-2 sentence summary of the proposal vs a generic demo board",
  "scenes": [
    { "id": "scene-1", "title": "...", "caption": "spoken/on-screen line", "duration": 6 }
  ]
}
Rules: exactly {{sceneCount}} scenes; durations 4–12s; captions concrete and filmable; no claims of generated video/images; template mood = {{templateId}}.`;

const analyze = `Extract a founder-film brief from website text. Return JSON only:
{
  "product": "what they build",
  "audience": "who it is for",
  "tone": "brand/voice tone",
  "claims": ["facts grounded in the provided text"],
  "sources": ["short quotes or labels from the text that support claims"],
  "uncertain": ["gaps, guesses, or missing info — never invent facts"]
}
Only use the provided page text. Put speculation only in uncertain.`;

const rows = [
  { key: 'sophie_system', title: 'Sophie system', body: system },
  { key: 'sophie_starter', title: 'Sophie starter chat', body: starter },
  { key: 'storyboard', title: 'Storyboard proposal', body: storyboard },
  { key: 'analyze_website', title: 'Website brief extract', body: analyze },
];

const sql = neon(url);
for (const r of rows) {
  await sql`
    INSERT INTO sf_prompts (key, title, body)
    VALUES (${r.key}, ${r.title}, ${r.body})
    ON CONFLICT (key) DO UPDATE SET
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      updated_at = now()
  `;
  console.log('upserted', r.key, `(${r.body.length} chars)`);
}
