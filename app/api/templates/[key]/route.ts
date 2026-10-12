import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sfTemplates } from '@/lib/db/schema';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ key: string }> };

function resolveKey(raw: string) {
  const k = raw.trim().toLowerCase();
  return k === 'founder' ? 'slush_founder' : k;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { key: raw } = await ctx.params;
    const key = resolveKey(raw);
    const db = getDb();
    const [row] = await db.select().from(sfTemplates).where(eq(sfTemplates.key, key)).limit(1);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({
      template: {
        id: row.key,
        name: row.name,
        category: row.category,
        time: row.time,
        image: row.image,
        headline: row.headline,
        description: row.description,
        locked: row.locked,
        projectTitle: row.projectTitle,
        fixed: row.fixed,
        slots: row.slots,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'get failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { key: raw } = await ctx.params;
    const key = resolveKey(raw);
    const body = (await req.json()) as {
      projectTitle?: string;
      fixed?: unknown;
      slots?: unknown;
      name?: string;
      headline?: string;
      description?: string;
      image?: string;
      locked?: boolean;
    };
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.projectTitle !== undefined) patch.projectTitle = String(body.projectTitle).slice(0, 200);
    if (body.fixed !== undefined) patch.fixed = body.fixed;
    if (body.slots !== undefined) patch.slots = body.slots;
    if (body.name !== undefined) patch.name = String(body.name).slice(0, 120);
    if (body.headline !== undefined) patch.headline = String(body.headline).slice(0, 200);
    if (body.description !== undefined) patch.description = String(body.description).slice(0, 400);
    if (body.image !== undefined) patch.image = String(body.image);
    if (body.locked !== undefined) patch.locked = Boolean(body.locked);

    const db = getDb();
    const [row] = await db.update(sfTemplates).set(patch).where(eq(sfTemplates.key, key)).returning();
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ template: row });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
