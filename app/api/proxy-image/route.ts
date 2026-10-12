import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** Same-origin image fetch so canvas export isn't CORS-tainted. */
export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get('url')?.trim() || '';
    if (!raw) return NextResponse.json({ error: 'url required' }, { status: 400 });

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return NextResponse.json({ error: 'invalid url' }, { status: 400 });
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return NextResponse.json({ error: 'unsupported protocol' }, { status: 400 });
    }

    const upstream = await fetch(target.href, {
      headers: { Accept: 'image/*,*/*' },
      redirect: 'follow',
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
      return NextResponse.json({ error: 'not an image' }, { status: 415 });
    }

    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType.startsWith('image/') ? contentType : 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'proxy failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
