import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sfBlocks } from '@/lib/db/schema';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      image?: string;
      description?: string;
      caption?: string;
      duration?: number;
      sortOrder?: number;
    };
    const patch: {
      image?: string;
      description?: string;
      caption?: string;
      duration?: number;
      sortOrder?: number;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (body.image !== undefined) patch.image = String(body.image).trim();
    if (body.description !== undefined) patch.description = String(body.description).trim().slice(0, 200);
    if (body.caption !== undefined) patch.caption = String(body.caption).trim().slice(0, 500);
    if (body.duration !== undefined) patch.duration = Math.max(1, Math.min(60, Number(body.duration) || 6));
    if (body.sortOrder !== undefined) patch.sortOrder = Number(body.sortOrder) || 0;
    const touched =
      patch.image !== undefined ||
      patch.description !== undefined ||
      patch.caption !== undefined ||
      patch.duration !== undefined ||
      patch.sortOrder !== undefined;
    if (!touched) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
    }
    const db = getDb();
    const [row] = await db.update(sfBlocks).set(patch).where(eq(sfBlocks.id, id)).returning();
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ block: row });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
