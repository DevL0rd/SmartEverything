import { API_ENDPOINTS as E, type NativeHubNetwork } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const network: { current: Partial<NativeHubNetwork> } = { current: {} };

vi.mock('./route-platform', () => ({
  hubNetwork: (): Partial<NativeHubNetwork> => network.current,
}));

const { ApiClient } = await import('./client');
const { sendUpload } = await import('./binary-upload');

const STORED = {
  revision: 3,
  scan: {
    opacity: 1,
    residualM: null,
    uploadedAt: '2026-11-02T10:00:00.000Z',
    uploadedBy: 'person-1',
    file: { hash: 'a'.repeat(64), format: 'spz', bytes: 4, name: 'home.spz' },
    lod: null,
    transform: { tx: 0, ty: 0, tz: 0, yawDeg: 0, scale: 1, levelled: false },
    points: [],
  },
};

interface Sent {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

class FakeXhr {
  static last: FakeXhr | null = null;
  static answer: { status: number; text: string } = { status: 200, text: '' };
  readonly upload: { onprogress: ((event: { loaded: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  responseURL = '';
  sent: Sent | null = null;
  aborted = false;
  private method = '';
  private url = '';
  private readonly headers: Record<string, string> = {};

  constructor() {
    FakeXhr.last = this;
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  getAllResponseHeaders(): string {
    return 'content-type: application/json\r\n';
  }

  send(body: unknown): void {
    this.sent = { method: this.method, url: this.url, headers: this.headers, body };
  }

  progress(loaded: number): void {
    this.upload.onprogress?.({ loaded });
  }

  finish(): void {
    this.status = FakeXhr.answer.status;
    this.responseText = FakeXhr.answer.text;
    this.responseURL = this.url;
    this.onload?.();
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }
}

function lastXhr(): FakeXhr {
  if (FakeXhr.last === null) throw new Error('nothing was sent');
  return FakeXhr.last;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  network.current = {};
  FakeXhr.last = null;
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function clientOf(): InstanceType<typeof ApiClient> {
  return new ApiClient({
    baseUrl: 'http://hub.test',
    token: 'secret',
    fetch: vi.fn<typeof fetch>(),
    onUnauthorized: (): void => undefined,
  });
}

const BODY = new Blob([new Uint8Array([1, 2, 3, 4])]);

describe('uploading a file body to the hub', () => {
  it('sends the raw bytes with the token, reports progress and reads the stored answer', async () => {
    FakeXhr.answer = { status: 200, text: JSON.stringify(STORED) };
    const progress: number[][] = [];
    const answer = clientOf().upload(
      E.uploadHomeMapScan,
      { params: { mapId: 'default' }, query: { format: 'spz', name: 'home.spz' } },
      BODY,
      {
        onProgress: (sent, total) => {
          progress.push([sent, total]);
        },
      },
    );
    await settle();
    const xhr = lastXhr();
    expect(xhr.sent).toStrictEqual({
      method: 'PUT',
      url: 'http://hub.test/api/home-maps/default/scan?format=spz&name=home.spz',
      headers: { authorization: 'Bearer secret', 'content-type': 'application/octet-stream' },
      body: BODY,
    });
    xhr.progress(2);
    xhr.progress(4);
    xhr.finish();
    expect(await answer).toStrictEqual(STORED);
    expect(progress).toStrictEqual([
      [2, 4],
      [4, 4],
    ]);
  });

  it('raises the hub refusal with its own message', async () => {
    FakeXhr.answer = {
      status: 400,
      text: JSON.stringify({
        error: { code: 'invalid_request', message: 'The scan file is refused: bad header.' },
      }),
    };
    const answer = clientOf().upload(
      E.uploadHomeMapScan,
      { params: { mapId: 'default' }, query: { format: 'spz', name: 'home.spz' } },
      BODY,
      { onProgress: (): void => undefined },
    );
    await settle();
    lastXhr().finish();
    await expect(answer).rejects.toMatchObject({
      code: 'invalid_request',
      message: 'The scan file is refused: bad header.',
    });
  });

  it('stops the request when the upload is cancelled', async () => {
    const controller = new AbortController();
    const answer = sendUpload(undefined, {
      url: 'http://hub.test/up',
      method: 'PUT',
      headers: {},
      body: BODY,
      signal: controller.signal,
      onProgress: (): void => undefined,
    });
    controller.abort();
    await expect(answer).rejects.toThrow();
    expect(lastXhr().aborted).toBe(true);
  });
});

describe('uploading through the pinned desktop route', () => {
  const lease = {
    baseUrl: 'https://hub.lan',
    scopeId: 'scope-1',
    generation: 1,
    endpoint: { kind: 'lan', url: 'https://hub.lan' },
    nativeAuthority: true,
    nativeRouteGeneration: 5,
    fetch: vi.fn<(url: string, init: RequestInit) => Promise<Response>>(),
    isCurrent: (): boolean => true,
    failed: (): void => undefined,
  } as const;

  function bridgeOf(accepting = true): {
    readonly chunks: number[][];
    readonly opened: unknown[];
    readonly aborted: string[];
  } {
    const chunks: number[][] = [];
    const opened: unknown[] = [];
    const aborted: string[] = [];
    network.current = {
      request: vi.fn(),
      openUpload: (request): Promise<void> => {
        opened.push(request);
        return Promise.resolve();
      },
      sendUpload: (chunk): Promise<boolean> => {
        chunks.push([...chunk.data]);
        return Promise.resolve(accepting);
      },
      finishUpload: (): Promise<{
        status: number;
        headers: Record<string, string>;
        body: string;
      }> => Promise.resolve({ status: 200, headers: {}, body: '{"ok":true}' }),
      abortUpload: (id): Promise<void> => {
        aborted.push(id);
        return Promise.resolve();
      },
    };
    return { chunks, opened, aborted };
  }

  it('opens the upload on the pinned route, streams the bytes and answers the hub reply', async () => {
    const bridge = bridgeOf();
    const progress: number[] = [];
    const response = await sendUpload(lease, {
      url: 'https://hub.lan/up',
      method: 'PUT',
      headers: { authorization: 'Bearer secret' },
      body: BODY,
      signal: undefined,
      onProgress: (sent) => {
        progress.push(sent);
      },
    });
    expect(await response.json()).toStrictEqual({ ok: true });
    expect(bridge.opened).toMatchObject([
      {
        scopeId: 'scope-1',
        routeGeneration: 5,
        url: 'https://hub.lan/up',
        method: 'PUT',
        headers: { authorization: 'Bearer secret' },
        length: 4,
      },
    ]);
    expect(bridge.chunks).toStrictEqual([[1, 2, 3, 4]]);
    expect(progress).toStrictEqual([4]);
    expect(bridge.aborted).toStrictEqual([]);
  });

  it('sends a tus PATCH through the captured pinned upload bridge', async () => {
    const bridge = bridgeOf();
    await sendUpload(lease, {
      url: 'https://hub.lan/drive/uploads/session',
      method: 'PATCH',
      headers: { 'upload-offset': '4' },
      body: BODY,
      signal: undefined,
      onProgress: () => undefined,
    });
    expect(bridge.opened).toMatchObject([
      { method: 'PATCH', scopeId: 'scope-1', routeGeneration: 5 },
    ]);
    expect(bridge.chunks).toEqual([[1, 2, 3, 4]]);
  });

  it('asks for a desktop update when the pinned route cannot carry uploads', async () => {
    network.current = { request: vi.fn() };
    await expect(
      sendUpload(lease, {
        url: 'https://hub.lan/up',
        method: 'PUT',
        headers: {},
        body: BODY,
        signal: undefined,
        onProgress: (): void => undefined,
      }),
    ).rejects.toThrow('Update the desktop app to upload files to your hub.');
  });
});
