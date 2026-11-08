import type { IncomingHttpHeaders } from 'node:http';
import type { RelayHeaders } from '@smarteverything/domain';

const HOP = new Set([
  'authorization',
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'host',
  'sec-websocket-key',
  'sec-websocket-version',
  'sec-websocket-extensions',
]);

function withoutPageKey(cookie: string): string {
  return cookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !part.startsWith('se_page_'))
    .join('; ');
}

export function forwardedHeaders(headers: IncomingHttpHeaders, port: number): RelayHeaders {
  const result: Record<string, string | string[]> = { host: `localhost:${String(port)}` };
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || HOP.has(name)) continue;
    if (name === 'cookie') {
      const kept = withoutPageKey(Array.isArray(value) ? value.join('; ') : value);
      if (kept !== '') result[name] = kept;
      continue;
    }
    result[name] = value;
  }
  return result;
}

function relayedLocation(location: string, prefix: string, port: number): string {
  const local = new RegExp(
    `^https?://(localhost|127\\.0\\.0\\.1|\\[::1\\]):${String(port)}(?=/|$)`,
    'u',
  );
  const path = location.replace(local, '');
  const rooted = path === '' ? '/' : path;
  return rooted.startsWith('/') && !rooted.startsWith('//') ? `${prefix}${rooted}` : location;
}

export function returnedHeaders(
  headers: RelayHeaders,
  prefix: string,
  port: number,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lowered = name.toLowerCase();
    if (HOP.has(lowered)) continue;
    result[lowered] =
      lowered === 'location' && typeof value === 'string'
        ? relayedLocation(value, prefix, port)
        : value;
  }
  return result;
}
