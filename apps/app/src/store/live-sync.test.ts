import { LIVE_TABLES } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConnection } from '../api/transport';
import type * as LiveSocket from './live-socket';
import type { SocketHandlers } from './live-socket';

const opened: { handlers: SocketHandlers; closed: boolean; target: unknown }[] = [];
const snapshotCalls: {
  resolve: (value: never) => void;
  reject: (error: Error) => void;
  request: unknown;
}[] = [];

vi.mock('./live-socket', async (importOriginal) => {
  const original = await importOriginal<typeof LiveSocket>();
  return {
    ...original,
    openLiveSocket: (target: unknown, handlers: SocketHandlers): (() => void) => {
      const entry = { handlers, closed: false, target };
      opened.push(entry);
      return (): void => {
        entry.closed = true;
      };
    },
  };
});

vi.mock('../api/transport', () => ({
  api: (): { callTables: (endpoint: unknown, request: unknown) => Promise<never> } => ({
    callTables: (_endpoint: unknown, request: unknown): Promise<never> =>
      new Promise<never>((resolve, reject) => {
        snapshotCalls.push({ resolve, reject, request });
      }),
  }),
  connectionRefused: vi.fn(),
}));

vi.mock('../../modules/health-connect', () => ({ runPushCommand: vi.fn() }));
vi.mock('../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../design/platform', () => ({ appPlatform: (): string => 'android' }));
vi.mock('../api/connection/active-route', () => ({
  routeFor: (): unknown => ({
    state: {
      get: (): { generation: number } => ({ generation: 0 }),
      subscribe: (): (() => void) => vi.fn(),
    },
    scopeId: 'hub',
    running: true,
    ready: (): Promise<void> => Promise.resolve(),
    refresh: vi.fn(),
  }),
}));
vi.mock('./ai-speech-requests', () => ({ deliverAiSpeech: vi.fn() }));

const { LiveSync, LINK_DEADLINE_MS } = await import('./live-sync');
const { EntityStore } = await import('./entity-store');
const { liveWatch } = await import('./live-watch');

const CONNECTION: ServerConnection = {
  url: 'http://hub.test:7880',
  token: `set_${'a'.repeat(64)}`,
};

async function started(): Promise<{
  sync: InstanceType<typeof LiveSync>;
  store: InstanceType<typeof EntityStore>;
}> {
  const store = new EntityStore();
  const sync = new LiveSync(CONNECTION, store, { onChanges: vi.fn(), onProfileChanged: vi.fn() });
  sync.start();
  await vi.advanceTimersByTimeAsync(0);
  return { sync, store };
}

function subscribed(index: number): void {
  const entry = opened[index];
  if (entry === undefined) {
    throw new Error(`socket ${String(index)} was never opened`);
  }
  entry.handlers.onMessage({
    kind: 'message',
    message: { type: 'subscribed', tables: [], streams: [], seq: 1 },
  });
}

describe('the live connection after the hub stops answering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    opened.length = 0;
    snapshotCalls.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives up on a socket that never opens and tries again', async () => {
    const { store } = await started();
    expect(opened).toHaveLength(1);
    vi.advanceTimersByTime(LINK_DEADLINE_MS);
    expect(opened[0]?.closed).toBe(true);
    expect(store.get().sync.status).toBe('interrupted');
    expect(store.get().sync.problem).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(opened).toHaveLength(2);
  });

  it('subscribes to every table and reads the snapshot once, with nothing negotiated', async () => {
    await started();
    expect(opened[0]?.target).toMatchObject({
      subscribe: { type: 'subscribe', tables: [...LIVE_TABLES] },
    });
    expect(opened[0]?.target).not.toHaveProperty('subscribe.capabilities');
    subscribed(0);
    expect(snapshotCalls).toHaveLength(1);
    expect(snapshotCalls[0]?.request).toStrictEqual({
      query: { nutrition: true, watch: true, weather: true, talk: true, assistant: true },
    });
    expect(opened).toHaveLength(1);
  });

  it('gives up on a snapshot request that never answers and tries again', async () => {
    await started();
    subscribed(0);
    expect(snapshotCalls).toHaveLength(1);
    vi.advanceTimersByTime(LINK_DEADLINE_MS);
    expect(opened[0]?.closed).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(opened).toHaveLength(2);
  });

  it('does not close the new socket when the old snapshot fails late', async () => {
    await started();
    subscribed(0);
    opened[0]?.handlers.onClose(1006, '');
    vi.advanceTimersByTime(1000);
    expect(opened).toHaveLength(2);
    snapshotCalls[0]?.reject(new Error('network down'));
    await vi.advanceTimersByTimeAsync(0);
    expect(opened[1]?.closed).toBe(false);
    expect(opened).toHaveLength(2);
  });

  it('stops retrying once stopped', async () => {
    const { sync } = await started();
    opened[0]?.handlers.onClose(1006, '');
    sync.stop();
    vi.advanceTimersByTime(120_000);
    expect(opened).toHaveLength(1);
  });

  it('waits longer after each failed attempt', async () => {
    await started();
    opened[0]?.handlers.onClose(1006, '');
    vi.advanceTimersByTime(1000);
    expect(opened).toHaveLength(2);
    opened[1]?.handlers.onClose(1006, '');
    vi.advanceTimersByTime(1999);
    expect(opened).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(opened).toHaveLength(3);
  });

  it('sends the held watch demand on every connect and stops sending when the socket closes', async () => {
    const DEVICE = '11111111-1111-4111-8111-111111111111';
    const sent: unknown[] = [];
    const release = liveWatch.hold(DEVICE, ['summary']);
    await started();
    opened[0]?.handlers.onOpen((message) => sent.push(message));
    expect(sent).toStrictEqual([
      { type: 'watch', demands: [{ deviceId: DEVICE, topics: ['summary'] }] },
    ]);
    opened[0]?.handlers.onClose(1006, '');
    vi.advanceTimersByTime(1000);
    const second: unknown[] = [];
    opened[1]?.handlers.onOpen((message) => second.push(message));
    expect(second).toHaveLength(1);
    release();
    vi.advanceTimersByTime(1000);
    expect(second).toHaveLength(2);
    opened[1]?.handlers.onClose(1006, '');
    liveWatch.hold(DEVICE, ['cpu'])();
    vi.advanceTimersByTime(1000);
    expect(second).toHaveLength(2);
  });

  it('does not let a replaced socket take over the demand', async () => {
    const stale: unknown[] = [];
    const { sync } = await started();
    sync.stop();
    sync.start();
    await vi.advanceTimersByTimeAsync(0);
    opened[0]?.handlers.onOpen((message) => stale.push(message));
    const release = liveWatch.hold('22222222-2222-4222-8222-222222222222', ['cpu']);
    vi.advanceTimersByTime(1000);
    release();
    expect(stale).toHaveLength(0);
  });
});
