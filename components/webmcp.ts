'use client';
import { useEffect, useRef } from 'react';
import { isTemplateAvailable, templates } from './shared';
import { hasOpenAIKey, requireFalKey, requireOpenAIKey } from './keys';
import { STUDIO_TABS, type Scene, type StoryboardProposal, type StudioTab, type WebsiteBrief } from './studio-actions';

type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint: boolean };
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  signal?: AbortSignal;
};

type Context = {
  registerTool: (tool: Tool, options?: { signal: AbortSignal }) => void | Promise<void>;
  unregisterTool?: (name: string) => void;
};

declare global {
  interface Window {
    __slush_webmcp_tools?: Record<string, Tool>;
    __slush_call_tool?: (name: string, input?: Record<string, unknown>) => Promise<unknown>;
  }
}

export type WebMCPActions = {
  preview: (id: string) => void;
  start: (id?: string) => void;
  getState?: () => unknown;
  selectScene?: (id: string) => void;
  setWebsite?: (url: string) => void;
  setBrief?: (brief: WebsiteBrief | null) => void;
  setPendingProposal?: (proposal: StoryboardProposal | null) => void;
  reviewProposal?: (proposalId: string) => unknown;
  applyProposal?: (proposalId: string) => unknown;
  pushActivity?: (text: string) => void;
  setNotice?: (text: string) => void;
  openSettings?: () => void;
  setTab?: (tab: StudioTab) => void;
  newProject?: () => unknown;
  setSceneImage?: (sceneId: string, imageUrl: string) => unknown;
};

function shouldIgnoreRegisterError(error: unknown) {
  if (error == null) return true;
  if (typeof error === 'string') {
    return error === 'webmcp-unmount' || /abort/i.test(error);
  }
  if (typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError') {
    return true;
  }
  return false;
}

function getModelContext(): Context | undefined {
  const doc = document as Document & { modelContext?: Context };
  if (doc.modelContext?.registerTool) return doc.modelContext;
  const win = window as Window & { modelContext?: Context };
  if (win.modelContext?.registerTool) return win.modelContext;
  return undefined;
}

function normalizeWebsite(raw: string) {
  const href = raw.startsWith('http') ? raw : `https://${raw}`;
  const url = new URL(href);
  if (!url.hostname.includes('.')) throw new Error('Enter a valid website, for example yourstartup.com.');
  return url;
}

async function analyzeWebsiteRemote(url: string, key: string) {
  const res = await fetch('/api/openai/analyze-website', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, url }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; brief?: WebsiteBrief };
  if (!res.ok || !data.brief) throw new Error(data.error || 'Website analysis failed');
  return data.brief;
}

async function proposeStoryboardRemote(input: {
  key: string;
  brief: unknown;
  templateId: string;
  sceneCount?: number;
}) {
  const res = await fetch('/api/openai/propose-storyboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    proposal?: StoryboardProposal;
  };
  if (!res.ok || !data.proposal) throw new Error(data.error || 'Storyboard proposal failed');
  return data.proposal;
}

async function generateSceneImageRemote(input: { key: string; prompt: string; sceneTitle?: string }) {
  const res = await fetch('/api/fal/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; imageUrl?: string; model?: string };
  if (!res.ok || !data.imageUrl) throw new Error(data.error || 'Image generation failed');
  return { imageUrl: data.imageUrl, model: data.model };
}

export function useWebMCP(actions: WebMCPActions, reregisterKey: unknown = true) {
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    const controller = new AbortController();
    const registered = new Map<string, Tool>();
    const agentified = hasOpenAIKey();

    const schema = {
      type: 'object',
      properties: { templateId: { type: 'string', enum: templates.map((t) => t.id) } },
      required: ['templateId'],
      additionalProperties: false,
    };

    function valid(input: Record<string, unknown>) {
      const id = String(input.templateId);
      if (!templates.some((t) => t.id === id)) throw new Error('Unknown template');
      if (!isTemplateAvailable(id)) throw new Error('Template is locked — only founder story is available right now.');
      return id;
    }

    const tools: Tool[] = [
      {
        name: 'list_templates',
        description: 'List available founder film template concepts. Effect: read.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: () =>
          templates.map(({ id, name, description, time, locked }) => ({
            id,
            name,
            description,
            time,
            locked,
            available: !locked,
          })),
      },
      {
        name: 'preview_template',
        description: 'Open a visual template preview in the visible interface. Effect: write (UI only). Does not generate video.',
        inputSchema: schema,
        execute: (input) => {
          const id = valid(input);
          ref.current.preview(id);
          return { status: 'preview_opened', templateId: id };
        },
      },
      {
        name: 'open_studio',
        description:
          'Open the Slush Filmmaker studio dashboard in the visible browser tab. Use after a valid OpenAI key is connected. Effect: write (navigation).',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: { type: 'string', enum: templates.map((t) => t.id) },
          },
          additionalProperties: false,
        },
        execute: (input) => {
          const id = input.templateId ? valid(input) : 'founder';
          ref.current.start(id);
          return { status: 'studio_opened', templateId: id };
        },
      },
      {
        name: 'start_film_creation',
        description: 'Open the studio with a selected template. Effect: write (navigation/template). Creates no video and incurs no generation charges.',
        inputSchema: schema,
        execute: (input) => {
          const id = valid(input);
          ref.current.start(id);
          return { status: 'studio_opened', templateId: id };
        },
      },
    ];

    if (ref.current.getState) {
      tools.push({
        name: 'get_studio_state',
        description:
          'Read the current local demo project, template, scenes, selection, website, BYOK/agentified flag, pending proposal, activity, and current studio tab. Effect: read.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: () => ref.current.getState?.(),
      });
    }

    if (ref.current.selectScene) {
      tools.push({
        name: 'select_scene',
        description: 'Select an existing storyboard scene in the visible editor. Effect: write (UI selection).',
        inputSchema: {
          type: 'object',
          properties: { sceneId: { type: 'string' } },
          required: ['sceneId'],
          additionalProperties: false,
        },
        execute: (input) => {
          ref.current.selectScene?.(String(input.sceneId));
          return { selectedSceneId: input.sceneId };
        },
      });
    }

    if (ref.current.setTab) {
      tools.push({
        name: 'open_studio_tab',
        description:
          'Switch the visible studio sidebar view. Use while chatting to take the founder to the right place (e.g. Projects, Editor, Templates, Overview). Effect: write (UI navigation).',
        inputSchema: {
          type: 'object',
          properties: { tab: { type: 'string', enum: [...STUDIO_TABS] } },
          required: ['tab'],
          additionalProperties: false,
        },
        execute: (input) => {
          const tab = String(input.tab) as StudioTab;
          if (!STUDIO_TABS.includes(tab)) throw new Error(`Unknown studio tab: ${tab}`);
          ref.current.setTab?.(tab);
          ref.current.pushActivity?.(`Opened ${tab}.`);
          return { status: 'tab_opened', tab };
        },
      });
    }

    if (ref.current.newProject) {
      tools.push({
        name: 'new_project',
        description:
          'Start a fresh untitled founder film (resets scenes/website/brief/pending proposal to defaults) and open Overview. Effect: write.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute: () => {
          const result = ref.current.newProject?.();
          ref.current.setTab?.('Overview');
          ref.current.setNotice?.('New project started.');
          return result;
        },
      });
    }

    if (ref.current.getState && ref.current.setSceneImage) {
      tools.push({
        name: 'generate_scene_image',
        description:
          'Paid/fal.ai: generate a cinematic still for a storyboard scene and apply it in the visible Assets/Editor UI. Requires fal.ai BYOK. Defaults to the selected scene; prompt defaults from title+caption. Effect: write + paid.',
        inputSchema: {
          type: 'object',
          properties: {
            sceneId: { type: 'string' },
            prompt: { type: 'string' },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          if (!ref.current.setSceneImage || !ref.current.getState) {
            throw new Error('generate_scene_image unavailable');
          }
          let key: string;
          try {
            key = requireFalKey();
          } catch {
            ref.current.openSettings?.();
            throw new Error('fal_byok_required');
          }

          const state = ref.current.getState() as {
            scenes?: Scene[];
            selectedSceneId?: string;
          };
          const scenes = Array.isArray(state.scenes) ? state.scenes : [];
          const sceneId = String(input.sceneId || state.selectedSceneId || scenes[0]?.id || '');
          const scene = scenes.find((s) => s.id === sceneId);
          if (!scene) throw new Error('Scene not found — call get_studio_state first');

          const prompt =
            String(input.prompt || '').trim() ||
            `${scene.title}. ${scene.caption}`.trim();

          const generated = await generateSceneImageRemote({
            key,
            prompt,
            sceneTitle: scene.title,
          });
          ref.current.setSceneImage(scene.id, generated.imageUrl);
          ref.current.selectScene?.(scene.id);
          ref.current.setTab?.('Assets');
          ref.current.pushActivity?.(`Generated image for ${scene.title}.`);
          ref.current.setNotice?.(`New still applied to ${scene.title}.`);
          return {
            effect: 'generate_image',
            sceneId: scene.id,
            title: scene.title,
            prompt,
            imageUrl: generated.imageUrl,
            model: generated.model,
          };
        },
      });
    }

    if (agentified && ref.current.getState) {
      tools.push(
        {
          name: 'analyze_website',
          description:
            'Paid/LLM: fetch a public website and return a structured product/audience/tone brief with sources vs uncertain. Updates studio website + brief. Effect: write + paid.',
          inputSchema: {
            type: 'object',
            properties: { url: { type: 'string' } },
            required: ['url'],
            additionalProperties: false,
          },
          execute: async (input) => {
            const key = requireOpenAIKey();
            const url = normalizeWebsite(String(input.url || ''));
            ref.current.setWebsite?.(url.href);
            const brief = await analyzeWebsiteRemote(url.href, key);
            ref.current.setBrief?.(brief);
            const host = url.hostname.replace(/^www\./, '');
            ref.current.pushActivity?.(`Website analyzed: ${host}`);
            ref.current.setNotice?.(`Analyzed ${host}. Ready to propose a storyboard.`);
            return { effect: 'analyze', brief };
          },
        },
        {
          name: 'propose_storyboard',
          description:
            'Paid/LLM: propose a storyboard from a brief. Does NOT mutate scenes — stores a pending proposal for human review. Effect: propose.',
          inputSchema: {
            type: 'object',
            properties: {
              brief: {},
              templateId: { type: 'string', enum: templates.map((t) => t.id) },
              sceneCount: { type: 'integer', minimum: 3, maximum: 8 },
            },
            required: ['brief', 'templateId'],
            additionalProperties: false,
          },
          execute: async (input) => {
            const key = requireOpenAIKey();
            const templateId = valid(input);
            const proposal = await proposeStoryboardRemote({
              key,
              brief: input.brief,
              templateId,
              sceneCount: input.sceneCount != null ? Number(input.sceneCount) : undefined,
            });
            ref.current.setPendingProposal?.(proposal);
            ref.current.pushActivity?.(`Storyboard proposal ready: ${proposal.proposalId}`);
            ref.current.setNotice?.('Storyboard proposal ready for review.');
            return { effect: 'propose', proposal };
          },
        },
        {
          name: 'review_proposal',
          description: 'Open the pending proposal diff in the visible UI for human review. Effect: write (UI).',
          inputSchema: {
            type: 'object',
            properties: { proposalId: { type: 'string' } },
            required: ['proposalId'],
            additionalProperties: false,
          },
          execute: (input) => {
            if (!ref.current.reviewProposal) throw new Error('review_proposal unavailable');
            return ref.current.reviewProposal(String(input.proposalId));
          },
        },
        {
          name: 'apply_proposal',
          description:
            'Apply a pending proposal to scenes/project after human review. Hard-fails if proposalId does not match. Effect: write.',
          inputSchema: {
            type: 'object',
            properties: { proposalId: { type: 'string' } },
            required: ['proposalId'],
            additionalProperties: false,
          },
          execute: (input) => {
            if (!ref.current.applyProposal) throw new Error('apply_proposal unavailable');
            const result = ref.current.applyProposal(String(input.proposalId));
            ref.current.setNotice?.('Storyboard proposal applied.');
            return result;
          },
        },
      );
    }

    window.__slush_webmcp_tools = window.__slush_webmcp_tools || {};
    window.__slush_call_tool = async (name, input = {}) => {
      const tool = registered.get(name) || window.__slush_webmcp_tools?.[name];
      if (!tool) {
        if (['analyze_website', 'propose_storyboard', 'review_proposal', 'apply_proposal'].includes(name) && !hasOpenAIKey()) {
          throw new Error('byok_required');
        }
        if (name === 'generate_scene_image') {
          try {
            requireFalKey();
          } catch {
            throw new Error('fal_byok_required');
          }
        }
        throw new Error(`WebMCP tool "${name}" not found`);
      }
      return tool.execute(input);
    };

    const context = getModelContext();

    for (const tool of tools) {
      registered.set(tool.name, tool);
      window.__slush_webmcp_tools[tool.name] = tool;

      if (!context?.registerTool) continue;

      const payload = { ...tool, signal: controller.signal };
      try {
        const ret = context.registerTool(payload, { signal: controller.signal });
        Promise.resolve(ret).catch((error) => {
          if (!shouldIgnoreRegisterError(error)) console.error(error);
        });
      } catch (error) {
        if (!shouldIgnoreRegisterError(error)) console.error(error);
      }
    }

    return () => {
      for (const tool of tools) {
        context?.unregisterTool?.(tool.name);
        delete window.__slush_webmcp_tools?.[tool.name];
        registered.delete(tool.name);
      }
      if (!controller.signal.aborted) controller.abort();
    };
  }, [reregisterKey]);
}

/** Invoke a registered WebMCP tool from UI (same path agents use). */
export async function callWebMCPTool(name: string, input: Record<string, unknown> = {}) {
  if (typeof window === 'undefined' || !window.__slush_call_tool) {
    throw new Error('WebMCP tools are not ready yet');
  }
  return window.__slush_call_tool(name, input);
}
