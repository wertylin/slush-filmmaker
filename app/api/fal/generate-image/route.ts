import { NextResponse } from 'next/server';

const FAL_MODEL = 'fal-ai/flux/schnell';

export async function POST(request: Request) {
  let body: { key?: string; prompt?: string; sceneTitle?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // BYOK only — never fall back to server .env (founder must paste their own fal key).
  const key = String(body.key || '').trim();
  if (key.length < 16) {
    return NextResponse.json({ error: 'Missing or invalid fal.ai key' }, { status: 401 });
  }

  const prompt = String(body.prompt || '').trim();
  if (prompt.length < 3) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const sceneTitle = String(body.sceneTitle || '').trim();
  const fullPrompt = [
    'Cinematic founder-film still, 16:9, photoreal, premium lighting, no text, no watermark, no logo.',
    sceneTitle ? `Scene: ${sceneTitle}.` : '',
    prompt,
  ]
    .filter(Boolean)
    .join(' ');

  const res = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: fullPrompt.slice(0, 1500),
      image_size: 'landscape_16_9',
      num_images: 1,
      enable_safety_checker: true,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    detail?: string | Array<{ msg?: string }>;
    error?: string;
    images?: Array<{ url?: string }>;
  };

  if (!res.ok) {
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((d) => d.msg).filter(Boolean).join('; ')
          : data.error;
    const message =
      res.status === 401 || res.status === 403
        ? 'Invalid fal.ai API key'
        : detail || 'fal.ai image generation failed';
    return NextResponse.json({ error: message }, { status: res.status === 401 || res.status === 403 ? 401 : 502 });
  }

  const imageUrl = data.images?.[0]?.url;
  if (!imageUrl) {
    return NextResponse.json({ error: 'fal.ai returned no image' }, { status: 502 });
  }

  return NextResponse.json({ imageUrl, model: FAL_MODEL });
}
