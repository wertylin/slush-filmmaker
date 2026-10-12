'use client';
import { useEffect, useRef } from 'react';
import { templates } from './shared';

type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint: boolean };
  execute: (input: Record<string, unknown>) => unknown;
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

export function useWebMCP(actions: {
  preview: (id: string) => void;
  start: (id?: string) => void;
  getState?: () => unknown;
  selectScene?: (id: string) => void;
}) {
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    const controller = new AbortController();
    const registered = new Map<string, Tool>();

    const schema = {
      type: 'object',
      properties: { templateId: { type: 'string', enum: templates.map((t) => t.id) } },
      required: ['templateId'],
      additionalProperties: false,
    };

    function valid(input: Record<string, unknown>) {
      const id = String(input.templateId);
      if (!templates.some((t) => t.id === id)) throw new Error('Unknown template');
      return id;
    }

    const tools: Tool[] = [
      {
        name: 'list_templates',
        description: 'List available founder film template concepts.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: () => templates.map(({ id, name, description, time }) => ({ id, name, description, time })),
      },
      {
        name: 'preview_template',
        description: 'Open a visual template preview in the visible interface. Does not generate video.',
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
          'Open the Slush Filmmaker studio dashboard in the visible browser tab. Use after a valid OpenAI key is connected.',
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
        description: 'Open the studio with a selected template. Creates no video and incurs no generation charges.',
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
        description: 'Read the current local demo project, selected scene, and activity.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: () => ref.current.getState?.(),
      });
    }

    if (ref.current.selectScene) {
      tools.push({
        name: 'select_scene',
        description: 'Select an existing storyboard scene in the visible editor.',
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

    window.__slush_webmcp_tools = window.__slush_webmcp_tools || {};
    window.__slush_call_tool = async (name, input = {}) => {
      const tool = registered.get(name) || window.__slush_webmcp_tools?.[name];
      if (!tool) throw new Error(`WebMCP tool "${name}" not found`);
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
  }, []);
}

/** Invoke a registered WebMCP tool from UI (same path agents use). */
export async function callWebMCPTool(name: string, input: Record<string, unknown> = {}) {
  if (typeof window === 'undefined' || !window.__slush_call_tool) {
    throw new Error('WebMCP tools are not ready yet');
  }
  return window.__slush_call_tool(name, input);
}
