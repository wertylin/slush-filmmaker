'use client';

const STORAGE = 'slush-byok';

type Byok = { openai?: string; fal?: string };

function read(): Byok {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE) || '{}') as Byok;
  } catch {
    return {};
  }
}

function write(next: Byok) {
  localStorage.setItem(STORAGE, JSON.stringify(next));
}

export function getOpenAIKey() {
  return read().openai?.trim() || '';
}

export function hasOpenAIKey() {
  const key = getOpenAIKey();
  return key.startsWith('sk-') && key.length >= 20;
}

/** Throws `{ error: 'byok_required' }` shaped Error message for WebMCP tools. */
export function requireOpenAIKey() {
  const key = getOpenAIKey();
  if (!key.startsWith('sk-') || key.length < 20) {
    throw new Error('byok_required');
  }
  return key;
}

export function setOpenAIKey(key: string) {
  const next = read();
  const trimmed = key.trim();
  if (trimmed) next.openai = trimmed;
  else delete next.openai;
  write(next);
}

export function getFalKey() {
  return read().fal?.trim() || '';
}

export function hasFalKey() {
  return getFalKey().length >= 16;
}

export function requireFalKey() {
  const key = getFalKey();
  if (key.length < 16) {
    throw new Error('fal_byok_required');
  }
  return key;
}

export function setFalKey(key: string) {
  const next = read();
  const trimmed = key.trim();
  if (trimmed) next.fal = trimmed;
  else delete next.fal;
  write(next);
}

export async function validateOpenAIKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed.startsWith('sk-') || trimmed.length < 20) {
    return { ok: false as const, error: 'Key should look like sk-...' };
  }

  const res = await fetch('/api/openai/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: trimmed }),
  });

  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    return { ok: false as const, error: data.error || 'Key validation failed' };
  }
  return { ok: true as const };
}
