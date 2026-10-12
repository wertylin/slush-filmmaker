import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sfProjects } from '@/lib/db/schema';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const clientKey = new URL(req.url).searchParams.get('clientKey')?.trim() || '';
    if (!clientKey) {
      return NextResponse.json({ error: 'clientKey required' }, { status: 400 });
    }
    const db = getDb();
    const [row] = await db
      .select()
      .from(sfProjects)
      .where(and(eq(sfProjects.id, id), eq(sfProjects.clientKey, clientKey)))
      .limit(1);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ project: row });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'get failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Upsert project fields (debounced autosave from studio). */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      clientKey?: string;
      title?: string;
      template?: string;
      website?: string;
      brief?: Record<string, unknown> | null;
      scenes?: unknown[];
      tracks?: unknown[];
      playhead?: number;
      pendingProposal?: Record<string, unknown> | null;
    };
    const clientKey = (body.clientKey || '').trim();
    if (!clientKey) {
      return NextResponse.json({ error: 'clientKey required' }, { status: 400 });
    }
    const db = getDb();
    const [existing] = await db
      .select({ id: sfProjects.id })
      .from(sfProjects)
      .where(and(eq(sfProjects.id, id), eq(sfProjects.clientKey, clientKey)))
      .limit(1);
    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const [row] = await db
      .update(sfProjects)
      .set({
        ...(body.title !== undefined ? { title: String(body.title).slice(0, 200) } : {}),
        ...(body.template !== undefined ? { template: String(body.template) } : {}),
        ...(body.website !== undefined ? { website: String(body.website) } : {}),
        ...(body.brief !== undefined ? { brief: body.brief } : {}),
        ...(Array.isArray(body.scenes) ? { scenes: body.scenes } : {}),
        ...(Array.isArray(body.tracks) ? { tracks: body.tracks } : {}),
        ...(typeof body.playhead === 'number' ? { playhead: body.playhead } : {}),
        ...(body.pendingProposal !== undefined ? { pendingProposal: body.pendingProposal } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(sfProjects.id, id), eq(sfProjects.clientKey, clientKey)))
      .returning();
    return NextResponse.json({ project: row });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
