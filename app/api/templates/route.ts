import { asc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sfTemplates } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const db = getDb();
    const templates = await db.select().from(sfTemplates).orderBy(asc(sfTemplates.sortOrder), asc(sfTemplates.createdAt));
    return NextResponse.json({
      templates: templates.map((t) => ({
        id: t.key,
        name: t.name,
        category: t.category,
        time: t.time,
        image: t.image,
        headline: t.headline,
        description: t.description,
        locked: t.locked,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'list failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      key?: string;
      name?: string;
      category?: string;
      time?: string;
      image?: string;
      headline?: string;
      description?: string;
      locked?: boolean;
      sortOrder?: number;
      projectTitle?: string;
      fixed?: unknown;
      slots?: unknown;
    };
    const key = (body.key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const name = (body.name || '').trim().slice(0, 120);
    const image = (body.image || '').trim();
    const headline = (body.headline || '').trim().slice(0, 200);
    const description = (body.description || '').trim().slice(0, 400);
    if (!key || !name || !image || !headline || !description) {
      return NextResponse.json({ error: 'key, name, image, headline, description required' }, { status: 400 });
    }
    const db = getDb();
    const [row] = await db
      .insert(sfTemplates)
      .values({
        key,
        name,
        category: (body.category || 'STORY').trim().slice(0, 40),
        time: (body.time || '60–90 SEC').trim().slice(0, 40),
        image,
        headline,
        description,
        locked: Boolean(body.locked),
        sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0,
        projectTitle: body.projectTitle?.trim().slice(0, 200) || name,
        fixed: (body.fixed as typeof sfTemplates.$inferInsert.fixed) ?? null,
        slots: (body.slots as typeof sfTemplates.$inferInsert.slots) ?? null,
      })
      .returning();
    return NextResponse.json({ template: row }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
