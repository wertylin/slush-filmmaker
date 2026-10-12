import { NextResponse } from 'next/server';

const TEMPLATE_IDS = ['founder', 'pitch', 'launch', 'update'] as const;

type ProposedScene = {
  id: string;
  title: string;
  caption: string;
  duration: number;
};

function parseProposal(
  raw: string,
  templateId: string,
  sceneCount: number,
): {
  projectTitle?: string;
  scenes: ProposedScene[];
  diffSummary: string;
} {
  let parsed: {
    projectTitle?: string;
    scenes?: ProposedScene[];
    diffSummary?: string;
  } = {};

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : raw) as typeof parsed;
  } catch {
    parsed = {};
  }

  const scenes = (Array.isArray(parsed.scenes) ? parsed.scenes : [])
    .slice(0, sceneCount)
    .map((s, i) => ({
      id: String(s.id || `scene-${i + 1}`),
      title: String(s.title || `Scene ${i + 1}`).slice(0, 80),
      caption: String(s.caption || '').slice(0, 280),
      duration: Math.max(1, Math.min(60, Number(s.duration) || 6)),
    }));

  while (scenes.length < sceneCount) {
    const i = scenes.length;
    scenes.push({
      id: `scene-${i + 1}`,
      title: `Scene ${i + 1}`,
      caption: 'Caption TBD — refine with the founder.',
      duration: 6,
    });
  }

  return {
    projectTitle: parsed.projectTitle ? String(parsed.projectTitle).slice(0, 120) : undefined,
    scenes,
    diffSummary: String(parsed.diffSummary || `Proposed ${scenes.length} scenes for ${templateId} template.`).slice(
      0,
      400,
    ),
  };
}

export async function POST(request: Request) {
  let body: {
    key?: string;
    brief?: unknown;
    templateId?: string;
    sceneCount?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const key = String(body.key || '').trim();
  if (!key.startsWith('sk-') || key.length < 20) {
    return NextResponse.json({ error: 'byok_required' }, { status: 401 });
  }

  const templateId = String(body.templateId || 'founder');
  if (!TEMPLATE_IDS.includes(templateId as (typeof TEMPLATE_IDS)[number])) {
    return NextResponse.json({ error: 'Unknown templateId' }, { status: 400 });
  }

  const sceneCount = Math.max(3, Math.min(8, Number(body.sceneCount) || 5));
  const brief = body.brief ?? {};
  const proposalId = `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You write founder-film storyboards. Return JSON only:
{
  "projectTitle": "short project title",
  "diffSummary": "1-2 sentence summary of the proposal vs a generic demo board",
  "scenes": [
    { "id": "scene-1", "title": "...", "caption": "spoken/on-screen line", "duration": 6 }
  ]
}
Rules: exactly ${sceneCount} scenes; durations 4–12s; captions concrete and filmable; no claims of generated video/images; template mood = ${templateId}.`,
        },
        {
          role: 'user',
          content: `Template: ${templateId}\nScene count: ${sceneCount}\n\nBrief:\n${JSON.stringify(brief, null, 2)}`,
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
  const parsed = parseProposal(content, templateId, sceneCount);

  return NextResponse.json({
    effect: 'propose',
    proposal: {
      proposalId,
      templateId,
      projectTitle: parsed.projectTitle,
      scenes: parsed.scenes,
      diffSummary: parsed.diffSummary,
      brief,
    },
  });
}
