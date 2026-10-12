import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sfPrompts } from '@/lib/db/schema';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { key } = await ctx.params;
    const db = getDb();
    const [row] = await db.select().from(sfPrompts).where(eq(sfPrompts.key, key)).limit(1);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ prompt: row });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'get failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { key } = await ctx.params;
    const body = (await req.json()) as { title?: string; body?: string };
    const patch: { title?: string; body?: string; updatedAt: Date } = { updatedAt: new Date() };
    if (body.title !== undefined) patch.title = String(body.title).trim().slice(0, 120);
    if (body.body !== undefined) patch.body = String(body.body);
    if (patch.title === undefined && patch.body === undefined) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
    }
    const db = getDb();
    const [row] = await db.update(sfPrompts).set(patch).where(eq(sfPrompts.key, key)).returning();
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ prompt: row });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
