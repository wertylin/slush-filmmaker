import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sfProjects } from '@/lib/db/schema';

export const runtime = 'nodejs';

function clientKeyFrom(req: Request, body?: { clientKey?: string }) {
  const q = new URL(req.url).searchParams.get('clientKey');
  return (body?.clientKey || q || '').trim();
}

/** List projects for a browser clientKey. */
export async function GET(req: Request) {
  try {
    const clientKey = clientKeyFrom(req);
    if (!clientKey) {
      return NextResponse.json({ error: 'clientKey required' }, { status: 400 });
    }
    const db = getDb();
    const rows = await db
      .select()
      .from(sfProjects)
      .where(eq(sfProjects.clientKey, clientKey))
      .orderBy(desc(sfProjects.updatedAt))
      .limit(50);
    return NextResponse.json({ projects: rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'list failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Create a new project. */
export async function POST(req: Request) {
  try {
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
    const clientKey = clientKeyFrom(req, body);
    if (!clientKey) {
      return NextResponse.json({ error: 'clientKey required' }, { status: 400 });
    }
    const db = getDb();
    const [row] = await db
      .insert(sfProjects)
      .values({
        clientKey,
        title: body.title?.slice(0, 200) || 'Untitled founder film',
        template: body.template || 'founder',
        website: body.website || '',
        brief: body.brief ?? null,
        scenes: Array.isArray(body.scenes) ? body.scenes : [],
        tracks: Array.isArray(body.tracks) ? body.tracks : [],
        playhead: typeof body.playhead === 'number' ? body.playhead : 0,
        pendingProposal: body.pendingProposal ?? null,
      })
      .returning();
    return NextResponse.json({ project: row }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
