import { NextResponse } from 'next/server';
import { getPrompt } from '@/lib/prompts-db';
import { fetchPublicText, htmlToText } from '@/lib/ssrf';

type Brief = {
  url: string;
  product: string;
  audience: string;
  tone: string;
  claims: string[];
  sources: string[];
  uncertain: string[];
  fetchedTextPreview: string;
};

function parseBrief(raw: string, url: string, preview: string): Brief {
  let parsed: Partial<Brief> = {};
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : raw) as Partial<Brief>;
  } catch {
    parsed = {};
  }

  return {
    url,
    product: String(parsed.product || 'Unknown product').slice(0, 400),
    audience: String(parsed.audience || 'Unknown audience').slice(0, 400),
    tone: String(parsed.tone || 'Unknown tone').slice(0, 200),
    claims: Array.isArray(parsed.claims) ? parsed.claims.map(String).slice(0, 12) : [],
    sources: Array.isArray(parsed.sources) ? parsed.sources.map(String).slice(0, 12) : [url],
    uncertain: Array.isArray(parsed.uncertain) ? parsed.uncertain.map(String).slice(0, 12) : [],
    fetchedTextPreview: preview,
  };
}

export async function POST(request: Request) {
  let body: { key?: string; url?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const key = String(body.key || '').trim();
  if (!key.startsWith('sk-') || key.length < 20) {
    return NextResponse.json({ error: 'byok_required' }, { status: 401 });
  }

  const rawUrl = String(body.url || '').trim();
  if (!rawUrl) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  let fetched: { url: string; html: string; truncated: boolean };
  try {
    fetched = await fetchPublicText(rawUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch URL';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const text = htmlToText(fetched.html);
  if (!text || text.length < 40) {
    return NextResponse.json(
      {
        error: 'Could not extract enough text from the page',
        url: fetched.url,
        uncertain: ['Page returned little readable text'],
      },
      { status: 422 },
    );
  }

  const preview = text.slice(0, 800);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: await getPrompt('analyze_website'),
        },
        {
          role: 'user',
          content: `URL: ${fetched.url}\nTruncated: ${fetched.truncated}\n\nPAGE TEXT:\n${text}`,
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data?.error?.message || (res.status === 401 ? 'Invalid OpenAI API key' : 'OpenAI request failed');
    return NextResponse.json({ error: message }, { status: res.status === 401 ? 401 : 502 });
  }

  const content = String(data?.choices?.[0]?.message?.content || '');
  const brief = parseBrief(content, fetched.url, preview);

  return NextResponse.json({
    effect: 'analyze',
    brief,
    truncated: fetched.truncated,
  });
}
