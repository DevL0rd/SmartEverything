import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeHubRequest, NativeHubResponse } from '@smarteverything/domain';

const requests: NativeHubRequest[] = [];
const ok = (): Promise<NativeHubResponse> =>
  Promise.resolve({ status: 200, headers: {}, body: '{}' });
let answer: (request: NativeHubRequest) => Promise<NativeHubResponse> = ok;
const realFetch = globalThis.fetch;

let bridged = true;
vi.mock('../../../modules/health-connect/src/hub-network', () => ({
  nativeHubNetwork: { capabilities: { http: true, websocket: true, media: false } },
}));
vi.mock('../../design/platform', () => ({
  desktopBridge: (): unknown =>
    bridged
      ? {
          hubNetwork: {
            capabilities: { http: true, websocket: true, media: false },
            request: (request: NativeHubRequest): Promise<NativeHubResponse> => {
              requests.push(request);
              return answer(request);
            },
          },
        }
      : null,
}));

const { pinnedFetch, hubFetch } = await import('./route-platform');

const LAN = { kind: 'lan', url: 'https://hub.local:7880' } as const;
const REMOTE = { kind: 'remote', url: 'https://home.example.com' } as const;

beforeEach(() => {
  requests.length = 0;
  answer = ok;
  bridged = true;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = realFetch;
});

describe('pinnedFetch through the desktop bridge', () => {
  it('sends text bodies and rejects other bodies instead of dropping them', async () => {
    await pinnedFetch('scope', 'https://hub.local:7880/x', { method: 'POST', body: '{"a":1}' });
    expect(requests[0]?.body).toBe('{"a":1}');
    await expect(
      pinnedFetch('scope', 'https://hub.local:7880/x', {
        method: 'POST',
        body: new Uint8Array([1, 2]),
      }),
    ).rejects.toThrow('text bodies only');
    expect(requests).toHaveLength(1);
  });

  it('lets a cancelled caller go at once without waiting for the native answer', async () => {
    answer = (): Promise<NativeHubResponse> => new Promise<NativeHubResponse>(() => undefined);
    const controller = new AbortController();
    const pending = pinnedFetch('scope', 'https://hub.local:7880/x', {
      method: 'GET',
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });

  it('never starts a request that was cancelled before it began', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      pinnedFetch('scope', 'https://hub.local:7880/x', {
        method: 'GET',
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });
});

describe('pinnedFetch on a platform without a bridge', () => {
  it('hands any body and the caller cancellation to the platform fetch, which reaches the pinned hub itself', async () => {
    bridged = false;
    const fetched = vi.fn((_url: unknown, _init?: RequestInit) =>
      Promise.resolve(new Response('{}')),
    );
    globalThis.fetch = fetched;
    const body = new Uint8Array([1, 2]);
    const controller = new AbortController();
    await pinnedFetch('scope', 'https://hub.local:7880/x', {
      method: 'POST',
      body,
      signal: controller.signal,
    });
    expect(requests).toHaveLength(0);
    expect(fetched).toHaveBeenCalledWith(
      'https://hub.local:7880/x',
      expect.objectContaining({ body, redirect: 'error' }),
    );
    controller.abort();
    expect(fetched.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});

describe('hubFetch', () => {
  it('returns the original response of a remote hub and leaves a long body running', async () => {
    const original = new Response('slow body', { status: 200 });
    const fetched = vi.fn(() => Promise.resolve(original));
    globalThis.fetch = fetched;
    const response = await hubFetch('scope', REMOTE, 'https://home.example.com/x', {
      method: 'GET',
    });
    expect(response).toBe(original);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await expect(response.text()).resolves.toBe('slow body');
    expect(fetched).toHaveBeenCalledWith(
      'https://home.example.com/x',
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('gives up on a remote hub that never answers headers', async () => {
    globalThis.fetch = (_url, init): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      });
    const pending = hubFetch('scope', REMOTE, 'https://home.example.com/x', { method: 'GET' });
    const failure = expect(pending).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(15_001);
    await failure;
  });

  it('passes the caller cancellation to a remote fetch', async () => {
    let seen: AbortSignal | null | undefined;
    globalThis.fetch = (_url, init): Promise<Response> => {
      seen = init?.signal;
      return Promise.resolve(new Response('{}'));
    };
    const controller = new AbortController();
    await hubFetch('scope', REMOTE, 'https://home.example.com/x', {
      method: 'GET',
      signal: controller.signal,
    });
    controller.abort();
    expect(seen?.aborted).toBe(true);
  });

  it('sends hub local addresses through the desktop bridge', async () => {
    await hubFetch('scope', LAN, 'https://hub.local:7880/x', { method: 'GET' });
    expect(requests[0]?.url).toBe('https://hub.local:7880/x');
  });
});
