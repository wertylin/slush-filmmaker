/** Resolve provider keys on the server. BYOK only — never fall back to server env secrets. */

export type KeyAuthBody = {
  key?: string;
  guest?: boolean;
};

export function resolveOpenAIKey(body: KeyAuthBody):
  | { ok: true; key: string; source: 'byok' }
  | { ok: false; error: string; status: number } {
  if (body.guest === true) {
    return { ok: false, error: 'Guest mode is disabled. Provide your own OpenAI key.', status: 401 };
  }

  const key = String(body.key || '').trim();
  if (!key.startsWith('sk-') || key.length < 20) {
    return { ok: false, error: 'Missing or invalid OpenAI key', status: 401 };
  }
  return { ok: true, key, source: 'byok' };
}

export function resolveFalKey(body: KeyAuthBody):
  | { ok: true; key: string; source: 'byok' }
  | { ok: false; error: string; status: number } {
  if (body.guest === true) {
    return { ok: false, error: 'Guest mode is disabled. Provide your own fal.ai key.', status: 401 };
  }

  const key = String(body.key || '').trim();
  if (key.length < 16) {
    return { ok: false, error: 'Missing or invalid fal.ai key', status: 401 };
  }
  return { ok: true, key, source: 'byok' };
}
