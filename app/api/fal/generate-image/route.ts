import { NextResponse } from 'next/server';
import { buildFalInput, extractFalImageUrl, resolveFalModel } from '@/lib/fal-models';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: {
    key?: string;
    prompt?: string;
    sceneTitle?: string;
    modelKey?: string;
    aspect?: string;
    refUrls?: string[];
  };

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

  let model;
  try {
    model = await resolveFalModel(body.modelKey);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown model' }, { status: 400 });
  }

  const sceneTitle = String(body.sceneTitle || '').trim();
  const fullPrompt = [
    'Cinematic founder-film still, photoreal, premium lighting, no text, no watermark, no logo.',
    sceneTitle ? `Scene: ${sceneTitle}.` : '',
    prompt,
  ]
    .filter(Boolean)
    .join(' ');

  const aspect = String(body.aspect || '16:9').trim() || '16:9';
  const refUrls = Array.isArray(body.refUrls) ? body.refUrls.map(String).filter(Boolean) : [];
  const falInput = buildFalInput(model, { prompt: fullPrompt, aspect, refUrls });

  const res = await fetch(`https://fal.run/${model.endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(falInput),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    detail?: string | Array<{ msg?: string }>;
    error?: string;
    request_id?: string;
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
        : String(detail || 'fal.ai image generation failed');
    return NextResponse.json(
      { error: message, modelKey: model.key, endpoint: model.endpoint },
      { status: res.status === 401 || res.status === 403 ? 401 : 502 },
    );
  }

  const imageUrl = extractFalImageUrl(data);
  if (!imageUrl) {
    return NextResponse.json({ error: 'fal.ai returned no image', modelKey: model.key }, { status: 502 });
  }

  return NextResponse.json({
    imageUrl,
    model: model.endpoint,
    modelKey: model.key,
    label: model.label,
    aspect,
    falRequestId: typeof data.request_id === 'string' ? data.request_id : null,
  });
}
