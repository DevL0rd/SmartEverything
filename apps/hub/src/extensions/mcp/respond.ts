import type { IncomingMessage, ServerResponse } from 'node:http';
import { PUBLIC_BODY_LIMIT, readBody } from '../../server/http';

export type Headers = Readonly<Record<string, string>>;

export const NO_STORE: Headers = { 'cache-control': 'no-store', pragma: 'no-cache' };

export function replyJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Headers = {},
): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    ...NO_STORE,
    ...headers,
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(text)),
  });
  response.end(text);
}

export function replyEmpty(response: ServerResponse, status: number, headers: Headers = {}): void {
  response.writeHead(status, { ...NO_STORE, ...headers });
  response.end();
}

export function redirect(response: ServerResponse, location: string): void {
  response.writeHead(303, { ...NO_STORE, location, 'referrer-policy': 'no-referrer' });
  response.end();
}

export class BodyFormatError extends Error {
  override readonly name = 'BodyFormatError';

  constructor(expected: string, received: string) {
    super(`The body must be sent as ${expected}; received ${received}.`);
  }
}

function typeOf(request: IncomingMessage): string {
  return (request.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

export async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const type = typeOf(request);
  if (type !== 'application/x-www-form-urlencoded') {
    throw new BodyFormatError(
      'application/x-www-form-urlencoded',
      type === '' ? 'no content type' : type,
    );
  }
  const raw = await readBody(request, PUBLIC_BODY_LIMIT);
  return new URLSearchParams(raw.toString('utf8'));
}

export async function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
  const type = typeOf(request);
  if (type !== 'application/json') {
    throw new BodyFormatError('application/json', type === '' ? 'no content type' : type);
  }
  const raw = await readBody(request, limit);
  const parsed: unknown = JSON.parse(raw.toString('utf8'));
  return parsed;
}

export function single(form: URLSearchParams, name: string): string | undefined {
  const values = form.getAll(name);
  return values.length === 1 ? values[0] : undefined;
}
