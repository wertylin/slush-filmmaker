'use client';

import { callWebMCPTool } from '@/components/webmcp';
import { isTemplateAvailable, templates } from '@/components/shared';
import { STUDIO_TABS, type StoryboardProposal, type StudioTab, type WebsiteBrief } from '@/components/studio-actions';

type ApiMessage = {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
};

export type StudioSnapshot = {
  project: string;
  template: string;
  scenes: Array<{ id: string; title: string; duration: number; caption: string }>;
  selectedSceneId: string;
  website?: string;
  activity?: string[];
  brief?: WebsiteBrief | null;
  pendingProposal?: StoryboardProposal | null;
  agentified?: boolean;
  falConnected?: boolean;
  tab?: StudioTab;
};

type ToolActions = {
  getState: () => unknown;
  getTimeline?: () => unknown;
  proposeTimelineEdits?: (input: { plan?: string; ops: unknown }) => unknown;
  preview: (id: string) => void;
  selectScene: (id: string) => void;
  start: (id?: string) => void;
  setWebsite?: (url: string) => void;
  setBrief?: (brief: WebsiteBrief | null) => void;
  setPendingProposal?: (proposal: StoryboardProposal | null) => void;
  reviewProposal?: (proposalId: string) => unknown;
  applyProposal?: (proposalId: string) => unknown;
  pushActivity?: (text: string) => void;
  setNotice?: (text: string) => void;
  setTab?: (tab: StudioTab) => void;
  newProject?: () => unknown;
  setSceneImage?: (sceneId: string, imageUrl: string) => unknown;
  openSettings?: () => void;
};

async function runTool(name: string, args: Record<string, unknown>, fallback: ToolActions) {
  try {
    return await callWebMCPTool(name, args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'byok_required') return { error: 'byok_required' };

    switch (name) {
      case 'get_studio_state':
        return fallback.getState();
      case 'get_timeline':
        if (!fallback.getTimeline) return { error: 'get_timeline unavailable' };
        return fallback.getTimeline();
      case 'propose_timeline_edits': {
        if (!fallback.proposeTimelineEdits) return { error: 'propose_timeline_edits unavailable' };
        const result = fallback.proposeTimelineEdits({
          plan: args.plan != null ? String(args.plan) : undefined,
          ops: args.ops,
        }) as { openEditor?: boolean };
        if (result?.openEditor) fallback.setTab?.('Editor');
        fallback.setNotice?.('Timeline updated.');
        return result;
      }
      case 'list_templates':
        return templates.map(({ id, name, description, time, locked }) => ({
          id,
          name,
          description,
          time,
          locked,
          available: !locked,
        }));
      case 'preview_template': {
        const templateId = String(args.templateId);
        if (!isTemplateAvailable(templateId)) return { error: 'Template is locked — only founder story is available.' };
        fallback.preview(templateId);
        return { status: 'preview_opened', templateId };
      }
      case 'select_scene':
        fallback.selectScene(String(args.sceneId));
        return { selectedSceneId: args.sceneId };
      case 'open_studio_tab': {
        const tab = String(args.tab) as StudioTab;
        if (!STUDIO_TABS.includes(tab)) return { error: `Unknown studio tab: ${tab}` };
        if (!fallback.setTab) return { error: 'open_studio_tab unavailable' };
        fallback.setTab(tab);
        fallback.pushActivity?.(`Opened ${tab}.`);
        return { status: 'tab_opened', tab };
      }
      case 'new_project': {
        if (!fallback.newProject) return { error: 'new_project unavailable' };
        const result = fallback.newProject();
        fallback.setTab?.('Editor');
        fallback.pushActivity?.('Opened new project in Editor.');
        fallback.setNotice?.('New project ready — you’re in the editor.');
        return { ...(typeof result === 'object' && result ? result : {}), tab: 'Editor' as const };
      }
      case 'start_film_creation':
      case 'open_studio': {
        const raw = args.templateId ? String(args.templateId) : 'founder';
        if (args.templateId && !isTemplateAvailable(raw)) {
          return { error: 'Template is locked — only founder story is available.' };
        }
        const templateId = isTemplateAvailable(raw) ? raw : 'founder';
        fallback.start(templateId);
        return { status: 'studio_opened', templateId };
      }
      case 'review_proposal':
        if (!fallback.reviewProposal) return { error: 'review_proposal unavailable' };
        return fallback.reviewProposal(String(args.proposalId));
      case 'apply_proposal':
        if (!fallback.applyProposal) return { error: 'apply_proposal unavailable' };
        return fallback.applyProposal(String(args.proposalId));
      case 'analyze_website':
      case 'propose_storyboard':
      case 'generate_scene_image':
        // These require network + BYOK; surface the original error
        return { error: msg || `Tool ${name} failed` };
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }
}

export async function chatWithSophie(opts: {
  key: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  userText: string;
  studioState: StudioSnapshot;
  actions: ToolActions;
}) {
  const messages: ApiMessage[] = [
    ...opts.history.map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: opts.userText },
  ];

  for (let step = 0; step < 8; step++) {
    const res = await fetch('/api/openai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: opts.key,
        messages,
        studioState: opts.studioState,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: ApiMessage;
    };

    if (!res.ok || !data.message) {
      throw new Error(data.error || 'Sophie failed to reply');
    }

    const assistant = data.message;
    messages.push({
      role: 'assistant',
      content: assistant.content,
      tool_calls: assistant.tool_calls,
    });

    const calls = assistant.tool_calls;
    if (!calls?.length) {
      const text = (assistant.content || '').trim();
      if (!text) throw new Error('Empty reply from Sophie');
      return text;
    }

    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        args = {};
      }
      const result = await runTool(call.function.name, args, opts.actions);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error('Sophie tool loop exceeded');
}
