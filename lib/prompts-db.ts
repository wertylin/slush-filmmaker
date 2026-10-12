import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sfPrompts } from '@/lib/db/schema';
import { SOPHIE_STARTER, SOPHIE_SYSTEM_PROMPT } from '@/prompts/sophie';

const FALLBACKS: Record<string, string> = {
  sophie_system: SOPHIE_SYSTEM_PROMPT,
  sophie_starter: SOPHIE_STARTER,
  storyboard: `You write founder-film storyboards. Return JSON only:
{
  "projectTitle": "short project title",
  "diffSummary": "1-2 sentence summary of the proposal vs a generic demo board",
  "scenes": [
    { "id": "scene-1", "title": "...", "caption": "spoken/on-screen line", "duration": 6 }
  ]
}
Rules: exactly {{sceneCount}} scenes; durations 4–12s; captions concrete and filmable; no claims of generated video/images; template mood = {{templateId}}.`,
  analyze_website: `Extract a founder-film brief from website text. Return JSON only:
{
  "product": "what they build",
  "audience": "who it is for",
  "tone": "brand/voice tone",
  "claims": ["facts grounded in the provided text"],
  "sources": ["short quotes or labels from the text that support claims"],
  "uncertain": ["gaps, guesses, or missing info — never invent facts"]
}
Only use the provided page text. Put speculation only in uncertain.`,
};

export function fillPrompt(body: string, vars: Record<string, string | number> = {}) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)),
    body,
  );
}

export async function getPrompt(key: string, vars?: Record<string, string | number>) {
  let body = FALLBACKS[key] || '';
  try {
    const db = getDb();
    const [row] = await db.select().from(sfPrompts).where(eq(sfPrompts.key, key)).limit(1);
    if (row?.body) body = row.body;
  } catch {
    /* DB down — use fallback */
  }
  if (!body) throw new Error(`prompt not found: ${key}`);
  return vars ? fillPrompt(body, vars) : body;
}
