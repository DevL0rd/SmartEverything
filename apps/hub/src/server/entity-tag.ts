import type { IncomingMessage, ServerResponse } from 'node:http';

const NOT_MODIFIED = 304;
const OK = 200;
const WEAK_PREFIX = 'W/';

function quoted(tag: string): string {
  return `"${tag}"`;
}

function opaqueOf(entry: string): string {
  const trimmed = entry.trim();
  return trimmed.startsWith(WEAK_PREFIX) ? trimmed.slice(WEAK_PREFIX.length) : trimmed;
}

export function matchesEntityTag(header: string | undefined, tag: string): boolean {
  if (header === undefined) return false;
  const wanted = quoted(tag);
  return header.split(',').some((entry) => entry.trim() === '*' || opaqueOf(entry) === wanted);
}

export function sendTagged(
  request: IncomingMessage,
  response: ServerResponse,
  body: unknown,
  tag: string,
): void {
  const headers = { etag: quoted(tag), 'cache-control': 'private, no-cache' };
  if (matchesEntityTag(request.headers['if-none-match'], tag)) {
    response.writeHead(NOT_MODIFIED, headers);
    response.end();
    return;
  }
  const text = JSON.stringify(body);
  response.writeHead(OK, {
    ...headers,
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  });
  response.end(text);
}
