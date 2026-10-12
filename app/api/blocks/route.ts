import { asc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sfBlocks } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const db = getDb();
    const blocks = await db.select().from(sfBlocks).orderBy(asc(sfBlocks.sortOrder), asc(sfBlocks.createdAt));
    return NextResponse.json({ blocks });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'list failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      key?: string;
      image?: string;
      description?: string;
      caption?: string;
      duration?: number;
      sortOrder?: number;
    };
    const image = (body.image || '').trim();
    const description = (body.description || '').trim().slice(0, 200);
    if (!image || !description) {
      return NextResponse.json({ error: 'image and description required' }, { status: 400 });
    }
    const key =
      (body.key || '').trim() ||
      `scene-${Date.now().toString(36)}`;
    const caption = (body.caption || '').trim().slice(0, 500);
    const duration = Math.max(1, Math.min(60, Number(body.duration) || 6));
    const sortOrder = Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0;
    const db = getDb();
    const [row] = await db
      .insert(sfBlocks)
      .values({ key, image, description, caption, duration, sortOrder })
      .returning();
    return NextResponse.json({ block: row }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
