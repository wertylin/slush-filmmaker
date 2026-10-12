const CLIENT_KEY = 'slush-client-key';
const PROJECT_ID = 'slush-project-id';

export function getClientKey(): string {
  try {
    let key = localStorage.getItem(CLIENT_KEY);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(CLIENT_KEY, key);
    }
    return key;
  } catch {
    return 'anonymous';
  }
}

export function getStoredProjectId(): string | null {
  try {
    return localStorage.getItem(PROJECT_ID);
  } catch {
    return null;
  }
}

export function setStoredProjectId(id: string) {
  try {
    if (!id) localStorage.removeItem(PROJECT_ID);
    else localStorage.setItem(PROJECT_ID, id);
  } catch {
    /* ignore */
  }
}

export type ProjectPayload = {
  title: string;
  template: string;
  website: string;
  brief: Record<string, unknown> | null;
  scenes: unknown[];
  tracks: unknown[];
  playhead: number;
  pendingProposal: Record<string, unknown> | null;
};

export async function loadRemoteProject(): Promise<
  | { id: string; payload: ProjectPayload }
  | null
> {
  const clientKey = getClientKey();
  const id = getStoredProjectId();
  if (id) {
    const res = await fetch(`/api/projects/${id}?clientKey=${encodeURIComponent(clientKey)}`);
    if (res.ok) {
      const data = (await res.json()) as { project: Record<string, unknown> };
      return { id: String(data.project.id), payload: rowToPayload(data.project) };
    }
  }
  const list = await fetch(`/api/projects?clientKey=${encodeURIComponent(clientKey)}`);
  if (!list.ok) return null;
  const data = (await list.json()) as { projects: Record<string, unknown>[] };
  const first = data.projects?.[0];
  if (!first) return null;
  setStoredProjectId(String(first.id));
  return { id: String(first.id), payload: rowToPayload(first) };
}

export async function ensureRemoteProject(payload: ProjectPayload): Promise<string | null> {
  const existing = getStoredProjectId();
  if (existing) return existing;
  const clientKey = getClientKey();
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey, ...payload }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { project: { id: string } };
  setStoredProjectId(data.project.id);
  return data.project.id;
}

export async function saveRemoteProject(id: string, payload: ProjectPayload): Promise<boolean> {
  const clientKey = getClientKey();
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey, ...payload }),
  });
  return res.ok;
}

function rowToPayload(row: Record<string, unknown>): ProjectPayload {
  return {
    title: String(row.title || 'Untitled founder film'),
    template: String(row.template || 'founder'),
    website: String(row.website || ''),
    brief: (row.brief as Record<string, unknown> | null) ?? null,
    scenes: Array.isArray(row.scenes) ? row.scenes : [],
    tracks: Array.isArray(row.tracks) ? row.tracks : [],
    playhead: typeof row.playhead === 'number' ? row.playhead : 0,
    pendingProposal: (row.pendingProposal as Record<string, unknown> | null) ?? null,
  };
}
