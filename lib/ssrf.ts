import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal']);

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === '0.0.0.0') return true;
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) {
    return true;
  }
  if (ip.startsWith('172.')) {
    const second = Number(ip.split('.')[1]);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 unique local / link-local
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
  return false;
}

export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http/https URLs are allowed');
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new Error('URL host is not allowed');
  }

  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Private IP addresses are not allowed');
  } else {
    const records = await lookup(host, { all: true }).catch(() => [] as Array<{ address: string }>);
    if (!records.length) throw new Error('Could not resolve host');
    for (const record of records) {
      if (isPrivateIp(record.address)) throw new Error('Host resolves to a private IP');
    }
  }

  return url;
}

export async function fetchPublicText(rawUrl: string, opts?: { timeoutMs?: number; maxBytes?: number }) {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const maxBytes = opts?.maxBytes ?? 200_000;
  const url = await assertSafeUrl(rawUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'SlushFilmmakerBot/0.1 (+https://slush.org)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);

    const finalUrl = res.url ? new URL(res.url) : url;
    if (finalUrl.protocol !== 'http:' && finalUrl.protocol !== 'https:') {
      throw new Error('Redirected to a disallowed protocol');
    }
    await assertSafeUrl(finalUrl.href);

    const buf = await res.arrayBuffer();
    const sliced = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    const html = new TextDecoder('utf-8', { fatal: false }).decode(sliced);
    return { url: finalUrl.href, html, truncated: buf.byteLength > maxBytes };
  } finally {
    clearTimeout(timer);
  }
}

export function htmlToText(html: string): string {
  const without =
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim() || '';
  return without.slice(0, 12_000);
}
