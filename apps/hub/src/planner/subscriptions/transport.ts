import { request as plainRequest, type IncomingMessage } from 'node:http';
import { request as secureRequest } from 'node:https';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { Readable } from 'node:stream';
import { assertLiteralHost, outsideOnlyLookup } from './address';

export const FEED_DEADLINE_MS = 120_000;

export class FeedHttpError extends Error {
  override readonly name = 'FeedHttpError';

  constructor(readonly status: number) {
    super(`The calendar server answered with status ${String(status)}.`);
  }
}

export class FeedRedirectError extends Error {
  override readonly name = 'FeedRedirectError';
}

export class FeedExpansionError extends Error {
  override readonly name = 'FeedExpansionError';

  constructor() {
    super('The calendar server sent a compressed answer that expands implausibly.');
  }
}

const EXPANSION_FREE_BYTES = 8 * 1024 * 1024;
const EXPANSION_RATIO = 200;

export interface FeedRequest {
  readonly url: URL;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly allowPrivate: boolean;
  readonly signal: AbortSignal;
}

export type FeedAnswer =
  | { readonly kind: 'not_modified'; readonly url: URL }
  | {
      readonly kind: 'body';
      readonly url: URL;
      readonly text: string;
      readonly etag: string | null;
      readonly lastModified: string | null;
    };

const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

function header(response: IncomingMessage, name: string): string | null {
  const value = response.headers[name];
  if (value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function decoded(response: IncomingMessage): Readable {
  const encoding = header(response, 'content-encoding')?.trim().toLowerCase();
  if (encoding === 'gzip') return response.pipe(createGunzip());
  if (encoding === 'br') return response.pipe(createBrotliDecompress());
  if (encoding === 'deflate') return response.pipe(createInflate());
  return response;
}

async function textOf(response: IncomingMessage): Promise<string> {
  const decoder = new TextDecoder('utf-8');
  const body = decoded(response);
  const compressed = body !== response;
  let received = 0;
  let expanded = 0;
  if (compressed) {
    response.on('data', (chunk: Buffer) => {
      received += chunk.length;
    });
  }
  let text = '';
  try {
    for await (const chunk of body) {
      const bytes = chunk instanceof Buffer ? chunk : Buffer.from(String(chunk));
      expanded += bytes.length;
      if (compressed && expanded > EXPANSION_FREE_BYTES && expanded > received * EXPANSION_RATIO) {
        throw new FeedExpansionError();
      }
      text += decoder.decode(bytes, { stream: true });
    }
  } catch (cause) {
    body.destroy();
    response.destroy();
    throw cause;
  }
  return text + decoder.decode();
}

function conditionalHeaders(request: FeedRequest, first: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'text/calendar, text/plain;q=0.5, */*;q=0.1',
    'accept-encoding': 'gzip, br, deflate',
    'user-agent': 'SmartEverything-Hub',
  };
  if (first && request.etag !== null) headers['if-none-match'] = request.etag;
  if (first && request.lastModified !== null) headers['if-modified-since'] = request.lastModified;
  return headers;
}

function hop(request: FeedRequest, url: URL, first: boolean): Promise<IncomingMessage> {
  assertLiteralHost(url, request.allowPrivate);
  const open = url.protocol === 'https:' ? secureRequest : plainRequest;
  return new Promise((resolve, reject) => {
    const sent = open(
      url,
      {
        method: 'GET',
        headers: conditionalHeaders(request, first),
        signal: request.signal,
        ...(request.allowPrivate ? {} : { lookup: outsideOnlyLookup }),
      },
      resolve,
    );
    sent.once('error', reject);
    sent.end();
  });
}

function nextUrl(response: IncomingMessage, from: URL): URL {
  const location = header(response, 'location');
  if (location === null)
    throw new FeedRedirectError('The calendar address redirected without saying where.');
  const target = new URL(location, from);
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new FeedRedirectError(`The calendar address redirected to a ${target.protocol} address.`);
  }
  return target;
}

export async function fetchFeed(request: FeedRequest): Promise<FeedAnswer> {
  const visited = new Set<string>();
  let url = request.url;
  for (let first = true; ; first = false) {
    if (visited.has(url.href))
      throw new FeedRedirectError('The calendar address redirects in a circle.');
    visited.add(url.href);
    const response = await hop(request, url, first);
    const status = response.statusCode ?? 0;
    if (REDIRECTS.has(status)) {
      response.resume();
      url = nextUrl(response, url);
    } else if (status === 304) {
      response.resume();
      return { kind: 'not_modified', url };
    } else if (status === 200) {
      return {
        kind: 'body',
        url,
        text: await textOf(response),
        etag: header(response, 'etag'),
        lastModified: header(response, 'last-modified'),
      };
    } else {
      response.resume();
      throw new FeedHttpError(status);
    }
  }
}
