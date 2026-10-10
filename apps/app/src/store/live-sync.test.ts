import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConnection } from '../api/transport';
import type * as LiveSocket from './live-socket';
import type { SocketHandlers } from './live-socket';

const opened: { handlers: SocketHandlers; closed: boolean }[] = [];
const snapshotCalls: { resolve: (value: never) => void; reject: (error: Error) => void }[] = [];

vi.mock('./live-socket', async (importOriginal) => {
  const original = await importOriginal<typeof LiveSocket>();
  return {
    ...original,
    openLiveSocket: (_target: unknown, handlers: SocketHandlers): (() => void) => {
      const entry = { handlers, closed: false };
      opened.push(entry);
      return (): void => {
        entry.closed = true;
      };
    },
  };
});

vi.mock('../api/transport', () => ({
  api: (): { callTables: () => Promise<never> } => ({
    callTables: (): Promise<never> =>
      new Promise<never>((resolve, reject) => {
        snapshotCalls.push({ resolve, reject });
      }),
  }),
  connectionRefused: vi.fn(),
}));

vi.mock('../../modules/health-connect', () => ({ runPushCommand: vi.fn() }));
vi.mock('../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../design/platform', () => ({ appPlatform: (): string => 'android' }));
vi.mock('./ai-speech-requests', () => ({ deliverAiSpeech: vi.fn() }));

const { LiveSync, LINK_DEADLINE_MS } = await import('./live-sync');
const { EntityStore } = await import('./entity-store');

const CONNECTION: ServerConnection = {
  url: 'http://hub.test:7880',
  token: `set_${'a'.repeat(64)}`,
};

function started(): {
  sync: InstanceType<typeof LiveSync>;
  store: InstanceType<typeof EntityStore>;
} {
  const store = new EntityStore();
  const sync = new LiveSync(CONNECTION, store, { onChanges: vi.fn(), onProfileChanged: vi.fn() });
  sync.start();
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

  it('gives up on a socket that never opens and tries again', () => {
    const { store } = started();
    expect(opened).toHaveLength(1);
    vi.advanceTimersByTime(LINK_DEADLINE_MS);
    expect(opened[0]?.closed).toBe(true);
    expect(store.get().sync.status).toBe('interrupted');
    expect(store.get().sync.problem).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(opened).toHaveLength(2);
  });

  it('gives up on a snapshot request that never answers and tries again', () => {
    started();
    subscribed(0);
    expect(snapshotCalls).toHaveLength(1);
    vi.advanceTimersByTime(LINK_DEADLINE_MS);
    expect(opened[0]?.closed).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(opened).toHaveLength(2);
  });

  it('does not close the new socket when the old snapshot fails late', async () => {
    started();
    subscribed(0);
    opened[0]?.handlers.onClose(1006, '');
    vi.advanceTimersByTime(1000);
    expect(opened).toHaveLength(2);
    snapshotCalls[0]?.reject(new Error('network down'));
    await vi.advanceTimersByTimeAsync(0);
    expect(opened[1]?.closed).toBe(false);
    expect(opened).toHaveLength(2);
  });

  it('stops retrying once stopped', () => {
    const { sync } = started();
    opened[0]?.handlers.onClose(1006, '');
    sync.stop();
    vi.advanceTimersByTime(120_000);
    expect(opened).toHaveLength(1);
  });
});
