import type { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMBEDDED_BROWSER_MESSAGE, type EmbeddedBrowserScope } from '@smarteverything/domain';

const hub = vi.hoisted((): { sockets: unknown[] } => ({ sockets: [] }));

class FakeSocket {
  readyState = 1;
  readonly sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    hub.sockets.push(this);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

vi.mock('expo-crypto', () => ({ randomUUID: (): string => globalThis.crypto.randomUUID() }));
vi.mock('../../../../api/connection/hub-socket', () => ({
  openHubSocket: (): FakeSocket => new FakeSocket(),
}));
vi.mock('../../../../api/connection/active-route', () => ({
  routeFor: (): { readonly state: { readonly subscribe: () => () => void } } => ({
    state: { subscribe: (): (() => void) => () => undefined },
  }),
}));

const { EmbeddedBrowserChannel } = await import('./embedded-browser-channel');
const { BrowserTabs } = await import('../browser-tabs');

const OWNER: Omit<EmbeddedBrowserScope, 'generation'> = {
  viewerId: '00000000-0000-4000-8000-000000000001',
  clientId: 'client',
  profileId: '00000000-0000-4000-8000-000000000002',
  chatId: '00000000-0000-4000-8000-000000000003',
};
const CONNECTION = { url: 'https://hub.test', token: 'token' };

function sockets(): readonly FakeSocket[] {
  return hub.sockets.filter((entry) => entry instanceof FakeSocket);
}
function latest(): FakeSocket {
  const socket = sockets().at(-1);
  if (socket === undefined) throw new Error('no socket was opened');
  return socket;
}
function registeredScope(socket: FakeSocket): EmbeddedBrowserScope {
  const message = EMBEDDED_BROWSER_MESSAGE.parse(socket.sent[0]);
  if (message.kind !== 'register') throw new Error('expected a registration');
  return message.scope;
}
function receive(socket: FakeSocket, value: unknown): void {
  socket.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) });
}
function connected(): { readonly socket: FakeSocket; readonly scope: EmbeddedBrowserScope } {
  const socket = latest();
  socket.onopen?.();
  const scope = registeredScope(socket);
  receive(socket, { kind: 'accepted', scope });
  return { socket, scope };
}
function readRequest(scope: EmbeddedBrowserScope): {
  readonly requestId: string;
  readonly scope: EmbeddedBrowserScope;
  readonly operation: { readonly kind: 'read' };
} {
  return { requestId: globalThis.crypto.randomUUID(), scope, operation: { kind: 'read' } };
}
async function settled(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}
function results(socket: FakeSocket): readonly z.output<typeof EMBEDDED_BROWSER_MESSAGE>[] {
  return socket.sent.slice(1).map((entry) => EMBEDDED_BROWSER_MESSAGE.parse(entry));
}

describe('embedded browser channel', () => {
  let channel: InstanceType<typeof EmbeddedBrowserChannel>;
  beforeEach(() => {
    vi.useFakeTimers();
    hub.sockets.length = 0;
    channel = new EmbeddedBrowserChannel(
      CONNECTION,
      OWNER,
      new BrowserTabs(OWNER.chatId, OWNER.profileId),
      () => undefined,
    );
  });
  afterEach(() => {
    channel.dispose();
    vi.useRealTimers();
  });

  it('answers a burst of requests without a concurrency cap', async () => {
    const { socket, scope } = connected();
    for (let index = 0; index < 40; index += 1)
      receive(socket, { kind: 'perform', request: readRequest(scope) });
    await settled();
    const answered = results(socket).filter(
      (message) => message.kind === 'result' && message.result !== null,
    );
    expect(answered).toHaveLength(40);
    expect(socket.readyState).toBe(1);
  });

  it('ignores a malformed message and keeps answering', async () => {
    const { socket, scope } = connected();
    receive(socket, 'not json');
    receive(socket, { kind: 'surprise' });
    receive(socket, { kind: 'perform', request: readRequest(scope) });
    await settled();
    expect(results(socket)).toHaveLength(1);
    expect(socket.readyState).toBe(1);
  });

  it('refuses one request that does not match the registration and stays connected', async () => {
    const { socket, scope } = connected();
    const stranger = { ...scope, generation: globalThis.crypto.randomUUID() };
    receive(socket, { kind: 'perform', request: readRequest(stranger) });
    receive(socket, { kind: 'perform', request: readRequest(scope) });
    await settled();
    const [refused, answered] = results(socket);
    expect(refused).toMatchObject({ kind: 'result', result: null });
    expect(answered).toMatchObject({ kind: 'result', reason: null });
    expect(socket.readyState).toBe(1);
  });

  it('reconnects with backoff after the hub refuses registration', async () => {
    const { socket } = connected();
    receive(socket, { kind: 'refused', reason: 'try again' });
    expect(socket.readyState).toBe(3);
    await vi.advanceTimersByTimeAsync(250);
    expect(sockets()).toHaveLength(2);
    connected();
  });

  it('re-registers the same viewer with a new generation after a reconnect', async () => {
    const first = connected();
    first.socket.close();
    await vi.advanceTimersByTimeAsync(30_000);
    const second = connected();
    expect(second.socket).not.toBe(first.socket);
    expect(second.scope.viewerId).toBe(first.scope.viewerId);
    expect(second.scope.generation).not.toBe(first.scope.generation);
  });

  it('keeps reconnecting after repeated disconnects', async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      latest().close();
      await vi.advanceTimersByTimeAsync(30_000);
    }
    expect(sockets().length).toBeGreaterThan(8);
  });
});
