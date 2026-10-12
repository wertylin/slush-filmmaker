/** Resolve provider keys on the server. Never return env secrets to the client. */

export type KeyAuthBody = {
  key?: string;
  guest?: boolean;
};

export function guestOpenAIAvailable() {
  const k = process.env.OPENAI_API_KEY?.trim() || '';
  return k.startsWith('sk-') && k.length >= 20;
}

export function guestFalAvailable() {
  const k = (process.env.FAL_AI_KEY || process.env.FAL_KEY || '').trim();
  return k.length >= 16;
}

export function resolveOpenAIKey(body: KeyAuthBody):
  | { ok: true; key: string; source: 'byok' | 'guest' }
  | { ok: false; error: string; status: number } {
  if (body.guest === true) {
    const env = process.env.OPENAI_API_KEY?.trim() || '';
    if (!env.startsWith('sk-') || env.length < 20) {
      return { ok: false, error: 'Slush guest OpenAI is not configured on the server', status: 503 };
    }
    return { ok: true, key: env, source: 'guest' };
  }

  const key = String(body.key || '').trim();
  if (!key.startsWith('sk-') || key.length < 20) {
    return { ok: false, error: 'Missing or invalid OpenAI key', status: 401 };
  }
  return { ok: true, key, source: 'byok' };
}

export function resolveFalKey(body: KeyAuthBody):
  | { ok: true; key: string; source: 'byok' | 'guest' }
  | { ok: false; error: string; status: number } {
  if (body.guest === true) {
    const env = (process.env.FAL_AI_KEY || process.env.FAL_KEY || '').trim();
    if (env.length < 16) {
      return { ok: false, error: 'Slush guest fal.ai is not configured on the server', status: 503 };
    }
    return { ok: true, key: env, source: 'guest' };
  }

  const key = String(body.key || '').trim();
  if (key.length < 16) {
    return { ok: false, error: 'Missing or invalid fal.ai key', status: 401 };
  }
  return { ok: true, key, source: 'byok' };
}
