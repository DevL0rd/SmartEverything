import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { FetchLike } from '../../src/plugins/builtin/fetch-like';
import {
  JsonApi,
  JsonApiRefusedError,
  JsonApiUnreachableError,
  reasonOf,
} from '../../src/plugins/builtin/json-api';

interface Seen {
  url: string;
  init: RequestInit;
}

function apiAnswering(response: () => Response | Promise<Response>): {
  readonly api: JsonApi;
  readonly seen: Seen[];
} {
  const seen: Seen[] = [];
  const fetcher: FetchLike = (url, init) => {
    seen.push({ url, init });
    return Promise.resolve(response());
  };
  const api = new JsonApi({
    service: 'Thing',
    baseUrl: 'http://thing.test:8080/',
    headers: { authorization: 'Bearer test-only' },
    refusal: 'Thing refused the key',
    timeoutMs: 1_000,
    fetcher,
  });
  return { api, seen };
}

const NUMBERS = z.array(z.number());

describe('JsonApi', () => {
  it('reads and validates JSON with the headers, query and method of the request', async () => {
    const { api, seen } = apiAnswering(() => new Response('[1,2]', { status: 200 }));
    await expect(api.read('/items', NUMBERS, { query: { limit: '2' } })).resolves.toEqual([1, 2]);
    expect(seen[0]?.url).toBe('http://thing.test:8080/items?limit=2');
    expect(seen[0]?.init.method).toBe('GET');
    expect(seen[0]?.init.headers).toMatchObject({ authorization: 'Bearer test-only' });
  });

  it('sends a JSON body and ignores the reply when writing', async () => {
    const { api, seen } = apiAnswering(() => new Response('OK', { status: 200 }));
    await api.write('/items', { method: 'POST', body: { a: 1 } });
    expect(seen[0]?.init.method).toBe('POST');
    expect(seen[0]?.init.body).toBe('{"a":1}');
  });

  it('maps 401 and 403 to a refusal carrying the service message', async () => {
    for (const status of [401, 403]) {
      const { api } = apiAnswering(() => new Response('', { status }));
      const failure = await api.read('/items', NUMBERS).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(JsonApiRefusedError);
      expect(failure).toHaveProperty('message', 'Thing refused the key');
    }
  });

  it('maps other failures to unreachable with a short body excerpt', async () => {
    const { api } = apiAnswering(() => new Response('x'.repeat(500), { status: 500 }));
    const failure = await api.write('/items', {}).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(JsonApiUnreachableError);
    expect(failure).toHaveProperty(
      'message',
      `Thing refused the request (500): ${'x'.repeat(200)}`,
    );
  });

  it('reports a failed connection with its cause', async () => {
    const api = new JsonApi({
      service: 'Thing',
      baseUrl: 'http://thing.test',
      headers: {},
      refusal: 'no',
      timeoutMs: 1_000,
      fetcher: (): Promise<Response> =>
        Promise.reject(new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') })),
    });
    await expect(api.read('/items', NUMBERS)).rejects.toThrow(
      'Thing can’t be reached: fetch failed (ECONNREFUSED)',
    );
  });

  it('reports a body that is not JSON and a body of the wrong shape', async () => {
    const notJson = apiAnswering(() => new Response('<html>', { status: 200 }));
    await expect(notJson.api.read('/items', NUMBERS)).rejects.toThrow('not JSON');
    const wrongShape = apiAnswering(() => new Response('{"a":1}', { status: 200 }));
    await expect(wrongShape.api.read('/items', NUMBERS)).rejects.toThrow(
      'Thing answered /items in an unexpected shape',
    );
  });

  it('reads an empty body as null for the schema to judge', async () => {
    const { api } = apiAnswering(() => new Response('', { status: 200 }));
    await expect(api.read('/items', z.null())).resolves.toBeNull();
  });

  it('stops waiting when the caller aborts', async () => {
    const controller = new AbortController();
    const api = new JsonApi({
      service: 'Thing',
      baseUrl: 'http://thing.test',
      headers: {},
      refusal: 'no',
      timeoutMs: 10_000,
      fetcher: (_url, init): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    });
    const pending = api.read('/items', NUMBERS, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow('Thing can’t be reached: aborted');
  });
});

describe('reasonOf', () => {
  it('names an error, its cause, or any other value', () => {
    expect(reasonOf(new Error('boom'))).toBe('boom');
    expect(reasonOf(new Error('boom', { cause: new Error('why') }))).toBe('boom (why)');
    expect(reasonOf('plain')).toBe('plain');
  });
});
