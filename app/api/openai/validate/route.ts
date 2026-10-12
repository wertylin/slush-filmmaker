import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  let key = '';
  try {
    const body = (await request.json()) as { key?: string };
    key = String(body.key || '').trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  if (!key.startsWith('sk-') || key.length < 20) {
    return NextResponse.json({ ok: false, error: 'Invalid key format' }, { status: 400 });
  }

  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return NextResponse.json(
      { ok: false, error: res.status === 401 ? 'Invalid API key' : 'OpenAI rejected the key', detail: detail.slice(0, 200) },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
