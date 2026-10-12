'use client';

const STORAGE = 'slush-byok';

type Byok = { openai?: string; fal?: string; guest?: boolean };

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

export function isGuestMode() {
  return read().guest === true;
}

/** Enable Slush guest (server .env keys). Clears stored BYOK so guest is the active mode. */
export function setGuestMode(on: boolean) {
  const next = read();
  if (on) {
    next.guest = true;
    delete next.openai;
    delete next.fal;
  } else {
    delete next.guest;
  }
  write(next);
}

export function getOpenAIKey() {
  return read().openai?.trim() || '';
}

export function hasOpenAIKey() {
  if (isGuestMode()) return true;
  const key = getOpenAIKey();
  return key.startsWith('sk-') && key.length >= 20;
}

/** Throws `byok_required` when neither BYOK nor guest. Returns real key or empty for guest. */
export function requireOpenAIKey() {
  if (isGuestMode()) return '';
  const key = getOpenAIKey();
  if (!key.startsWith('sk-') || key.length < 20) {
    throw new Error('byok_required');
  }
  return key;
}

/** Auth fields to merge into OpenAI API request bodies. */
export function openaiAuthBody(): { guest: true } | { key: string } {
  if (isGuestMode()) return { guest: true };
  return { key: requireOpenAIKey() };
}

export function setOpenAIKey(key: string) {
  const next = read();
  const trimmed = key.trim();
  if (trimmed) {
    next.openai = trimmed;
    delete next.guest;
  } else {
    delete next.openai;
  }
  write(next);
}

export function getFalKey() {
  return read().fal?.trim() || '';
}

export function hasFalKey() {
  if (isGuestMode()) return true;
  return getFalKey().length >= 16;
}

export function requireFalKey() {
  if (isGuestMode()) return '';
  const key = getFalKey();
  if (key.length < 16) {
    throw new Error('fal_byok_required');
  }
  return key;
}

export function falAuthBody(): { guest: true } | { key: string } {
  if (isGuestMode()) return { guest: true };
  return { key: requireFalKey() };
}

export function setFalKey(key: string) {
  const next = read();
  const trimmed = key.trim();
  if (trimmed) {
    next.fal = trimmed;
    delete next.guest;
  } else {
    delete next.fal;
  }
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

export async function fetchGuestAvailability() {
  const res = await fetch('/api/keys/guest-status');
  const data = (await res.json().catch(() => ({}))) as {
    openai?: boolean;
    fal?: boolean;
    available?: boolean;
  };
  return {
    openai: Boolean(data.openai),
    fal: Boolean(data.fal),
    available: Boolean(data.available ?? (data.openai || data.fal)),
  };
}
