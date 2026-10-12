import { NextResponse } from 'next/server';
import { getPrompt } from '@/lib/prompts-db';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
};

const TEMPLATE_ENUM = ['slush_founder', 'founder', 'pitch', 'launch', 'update'] as const;
const STUDIO_TAB_ENUM = ['Overview', 'Templates', 'Projects', 'Editor', 'Assets', 'Docs'] as const;

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_studio_state',
      description:
        'Read project, template, scenes, selection, website, brief, pending proposal, agentified flag, and current studio tab. Call before advising.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_templates',
      description: 'List available founder film templates.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'preview_template',
      description: 'Open a template preview in the visible UI.',
      parameters: {
        type: 'object',
        properties: { templateId: { type: 'string', enum: [...TEMPLATE_ENUM] } },
        required: ['templateId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'select_scene',
      description: 'Select a storyboard scene in the visible editor (opens Editor).',
      parameters: {
        type: 'object',
        properties: { sceneId: { type: 'string' } },
        required: ['sceneId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_timeline',
      description:
        'Read Editor NLE timeline: totalDuration, playhead, scenes with absolute start/end, and track clips. Call before and after timeline edits. Times are CURRENT TIMELINE seconds.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'propose_timeline_edits',
      description:
        "Apply a batch of timeline ops to the live Editor (Panoptik-style). Ops: update_scene, reorder_scenes, add_scene, delete_scene, split_scene, select_scene, seek, upsert_clip, update_clip, delete_clip, open_editor. trackId: founder|product|broll|titles|vo|music|sfx|captions. Re-read get_timeline after.",
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'string' },
          ops: {
            type: 'array',
            minItems: 1,
            items: { type: 'object', additionalProperties: true },
          },
        },
        required: ['ops'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_studio_tab',
      description:
        'Switch the visible studio sidebar view so the founder sees the right place while chatting (Overview, Templates, Projects, Editor, Assets, Docs).',
      parameters: {
        type: 'object',
        properties: { tab: { type: 'string', enum: [...STUDIO_TAB_ENUM] } },
        required: ['tab'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'new_project',
      description:
        'Call whenever the founder asks to start / begin / create a new project or fresh film. Creates a fresh untitled founder film and navigates the visible UI to the project detail (Editor) so the founder lands inside it.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'start_film_creation',
      description: 'Switch the studio to a template.',
      parameters: {
        type: 'object',
        properties: { templateId: { type: 'string', enum: [...TEMPLATE_ENUM] } },
        required: ['templateId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_website',
      description:
        'Paid/LLM: analyze a public website into a structured brief (product/audience/tone/sources/uncertain). Updates studio website state.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'propose_storyboard',
      description:
        'Paid/LLM: propose scenes from a brief. Does NOT mutate the live storyboard — creates a pending proposal for review.',
      parameters: {
        type: 'object',
        properties: {
          brief: { type: 'object', additionalProperties: true },
          templateId: { type: 'string', enum: [...TEMPLATE_ENUM] },
          sceneCount: { type: 'integer', minimum: 3, maximum: 8 },
        },
        required: ['brief', 'templateId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'review_proposal',
      description: 'Open the pending proposal diff UI for the human to review.',
      parameters: {
        type: 'object',
        properties: { proposalId: { type: 'string' } },
        required: ['proposalId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'apply_proposal',
      description: 'Apply a pending proposal to scenes/project after human review. Fails if proposalId mismatches.',
      parameters: {
        type: 'object',
        properties: { proposalId: { type: 'string' } },
        required: ['proposalId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_scene_image',
      description:
        'Paid/fal.ai: generate a cinematic still and add it as a NEW Assets source card (does not overwrite or auto-apply to timeline scenes). Requires fal.ai key (falConnected). Optional sceneId/prompt for context only.',
      parameters: {
        type: 'object',
        properties: {
          sceneId: { type: 'string' },
          prompt: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
];

export async function POST(request: Request) {
  let body: {
    key?: string;
    messages?: ChatMessage[];
    studioState?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const key = String(body.key || '').trim();
  if (!key.startsWith('sk-')) {
    return NextResponse.json({ error: 'Missing or invalid OpenAI key' }, { status: 401 });
  }

  const history = Array.isArray(body.messages) ? body.messages : [];
  const sophieSystem = await getPrompt('sophie_system');
  const system: ChatMessage = {
    role: 'system',
    content: `${sophieSystem}

Current studio snapshot (also refresh via get_studio_state tool):
${JSON.stringify(body.studioState ?? {}, null, 2)}

In this in-app chat, OpenAI function tools map to the same WebMCP actions. Prefer tools over guessing.`,
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      messages: [system, ...history],
      tools: TOOLS,
      tool_choice: 'auto',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data?.error?.message ||
      (res.status === 401 ? 'Invalid OpenAI API key' : 'OpenAI request failed');
    return NextResponse.json({ error: message }, { status: res.status === 401 ? 401 : 502 });
  }

  const choice = data?.choices?.[0]?.message;
  if (!choice) {
    return NextResponse.json({ error: 'Empty model response' }, { status: 502 });
  }

  return NextResponse.json({
    message: {
      role: 'assistant' as const,
      content: choice.content ?? null,
      tool_calls: choice.tool_calls ?? undefined,
    },
  });
}
