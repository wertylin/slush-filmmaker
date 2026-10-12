import { asc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sfPrompts } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const db = getDb();
    const prompts = await db.select().from(sfPrompts).orderBy(asc(sfPrompts.key));
    return NextResponse.json({ prompts });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'list failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { key?: string; title?: string; body?: string };
    const key = (body.key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const title = (body.title || key).trim().slice(0, 120);
    const text = (body.body || '').trim();
    if (!key || !text) {
      return NextResponse.json({ error: 'key and body required' }, { status: 400 });
    }
    const db = getDb();
    const [row] = await db.insert(sfPrompts).values({ key, title, body: text }).returning();
    return NextResponse.json({ prompt: row }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
