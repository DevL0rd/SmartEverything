import { PrinterError } from '@smarteverything/domain';
import type { PrinterEvent } from '@smarteverything/ipp';
import { getEventListeners } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushChannel, type PushDeps } from '../../../src/plugins/builtin/printer/push';

const EVENT: PrinterEvent = {
  sequence: 7,
  events: ['job-completed'],
  state: 3,
  reasons: [],
  accepting: true,
  jobId: 12,
  jobState: 9,
  text: 'done',
};

interface Rig {
  readonly channel: PushChannel;
  readonly subscribe: ReturnType<typeof vi.fn>;
  readonly renew: ReturnType<typeof vi.fn>;
  readonly notifications: ReturnType<typeof vi.fn>;
  readonly saves: unknown[];
  readonly changed: PrinterEvent[][];
  readonly failures: unknown[];
  readonly lapsed: ReturnType<typeof vi.fn>;
  readonly controller: AbortController;
}

function rig(
  options: {
    readonly saved?: { id: number; sequence: number | null } | null;
    readonly notifications?: () => Promise<{
      events: PrinterEvent[];
      intervalSeconds: number | null;
      lapsed: boolean;
    }>;
    readonly grant?: { id: number; leaseSeconds: number | null } | null;
  } = {},
): Rig {
  const controller = new AbortController();
  const saves: unknown[] = [];
  const changed: PrinterEvent[][] = [];
  const failures: unknown[] = [];
  const lapsed = vi.fn();
  const subscribe = vi.fn(() =>
    Promise.resolve(options.grant === undefined ? { id: 5, leaseSeconds: 100 } : options.grant),
  );
  const renew = vi.fn(() => Promise.resolve());
  const pending = (): Promise<never> => new Promise<never>(() => undefined);
  const notifications = vi.fn(options.notifications ?? pending);
  let current = options.saved ?? null;
  const deps: PushDeps = {
    client: { subscribe, renew, unsubscribe: vi.fn(), notifications },
    saved: () => current,
    save: (value) => {
      current = value;
      saves.push(value);
    },
    changed: (events) => changed.push([...events]),
    lapsed,
    failed: (cause) => failures.push(cause),
    signal: controller.signal,
    leaseSeconds: () => 3600,
  };
  return {
    channel: new PushChannel(deps),
    subscribe,
    renew,
    notifications,
    saves,
    changed,
    failures,
    lapsed,
    controller,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('push channel', () => {
  it('subscribes, saves the grant and listens for notifications', async () => {
    const r = rig();
    expect(await r.channel.start()).toBe(true);
    expect(r.channel.active).toBe(true);
    expect(r.saves).toStrictEqual([{ id: 5, sequence: null }]);
    expect(r.notifications).toHaveBeenCalledWith(5, null, r.controller.signal);
    expect(await r.channel.start()).toBe(true);
    expect(r.subscribe).toHaveBeenCalledOnce();
    r.channel.stop();
    expect(r.channel.active).toBe(false);
  });

  it('reuses a saved subscription and its last sequence number', async () => {
    const r = rig({ saved: { id: 9, sequence: 4 } });
    await r.channel.start();
    expect(r.subscribe).not.toHaveBeenCalled();
    expect(r.notifications).toHaveBeenCalledWith(9, 4, r.controller.signal);
    r.channel.stop();
  });

  it('reports a printer without push as not started and without an error', async () => {
    const r = rig({ grant: null });
    expect(await r.channel.start()).toBe(false);
    expect(r.failures).toStrictEqual([]);
    expect(r.channel.active).toBe(false);
  });

  it('passes on notifications, remembers the sequence and waits at least five seconds between asks', async () => {
    let calls = 0;
    const r = rig({
      notifications: () => {
        calls += 1;
        return calls === 1
          ? Promise.resolve({ events: [EVENT], intervalSeconds: 1, lapsed: false })
          : new Promise<never>(() => undefined);
      },
    });
    await r.channel.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(r.changed).toStrictEqual([[EVENT]]);
    expect(r.saves.at(-1)).toStrictEqual({ id: 5, sequence: 7 });
    expect(r.notifications).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_998);
    expect(r.notifications).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(r.notifications).toHaveBeenCalledTimes(2);
    r.channel.stop();
  });

  it('renews the lease at eighty percent of its length', async () => {
    const r = rig();
    await r.channel.start();
    await vi.advanceTimersByTimeAsync(79_999);
    expect(r.renew).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(r.renew).toHaveBeenCalledWith(5);
    await vi.advanceTimersByTimeAsync(80_000);
    expect(r.renew).toHaveBeenCalledTimes(2);
    r.channel.stop();
  });

  it('drops the subscription, says so and tries again in five minutes when asking fails', async () => {
    let calls = 0;
    const r = rig({
      notifications: () => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new PrinterError('unreachable', 'gone'))
          : new Promise<never>(() => undefined);
      },
    });
    await r.channel.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(r.channel.active).toBe(false);
    expect(r.saves.at(-1)).toBeNull();
    expect(r.failures[0]).toBeInstanceOf(PrinterError);
    expect(r.lapsed).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(r.subscribe).toHaveBeenCalledTimes(2);
    r.channel.stop();
  });

  it('turns an unknown failure into an unreachable error and a failed renew into a drop', async () => {
    const r = rig();
    r.renew.mockRejectedValueOnce(new Error('boom'));
    await r.channel.start();
    await vi.advanceTimersByTimeAsync(80_001);
    expect(r.channel.active).toBe(false);
    expect(r.failures[0]).toMatchObject({ reason: 'unreachable' });
    r.channel.stop();
  });

  it('does not report a drop that happens after the printer was stopped on purpose', async () => {
    const r = rig({ notifications: () => Promise.reject(new Error('aborted')) });
    r.controller.abort();
    await r.channel.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(r.failures).toStrictEqual([]);
    expect(r.lapsed).not.toHaveBeenCalled();
  });

  it('records a failed subscribe', async () => {
    const r = rig();
    r.subscribe.mockRejectedValueOnce(new PrinterError('not_authorized', 'no'));
    expect(await r.channel.start()).toBe(false);
    expect(r.failures).toHaveLength(1);
    expect(r.saves.at(-1)).toBeNull();
  });

  it('subscribes again at once when the printer no longer knows the subscription', async () => {
    let calls = 0;
    const r = rig({
      saved: { id: 9, sequence: 4 },
      notifications: () => {
        calls += 1;
        return calls === 1
          ? Promise.resolve({ events: [], intervalSeconds: null, lapsed: true })
          : new Promise<never>(() => undefined);
      },
    });
    await r.channel.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(r.subscribe).toHaveBeenCalledOnce();
    expect(r.saves.at(-1)).toStrictEqual({ id: 5, sequence: null });
    expect(r.notifications).toHaveBeenLastCalledWith(5, null, r.controller.signal);
    expect(r.channel.active).toBe(true);
    expect(r.lapsed).toHaveBeenCalledOnce();
    r.channel.stop();
  });

  it('keeps trying every five minutes when subscribing again fails', async () => {
    let calls = 0;
    const r = rig({
      notifications: () => {
        calls += 1;
        return calls === 1
          ? Promise.resolve({ events: [], intervalSeconds: null, lapsed: true })
          : new Promise<never>(() => undefined);
      },
    });
    r.subscribe
      .mockResolvedValueOnce({ id: 5, leaseSeconds: 100 })
      .mockRejectedValueOnce(new PrinterError('unreachable', 'down'));
    await r.channel.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(r.channel.active).toBe(false);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(r.subscribe).toHaveBeenCalledTimes(3);
    expect(r.channel.active).toBe(true);
    r.channel.stop();
  });

  it('retries the first subscribe in five minutes when it fails', async () => {
    const r = rig();
    r.subscribe.mockRejectedValueOnce(new PrinterError('unreachable', 'down'));
    expect(await r.channel.start()).toBe(false);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(r.channel.active).toBe(true);
    r.channel.stop();
  });

  it('leaves no abort listeners behind after many waits', async () => {
    let calls = 0;
    const r = rig({
      notifications: () => {
        calls += 1;
        return calls <= 30
          ? Promise.resolve({ events: [], intervalSeconds: 1, lapsed: false })
          : new Promise<never>(() => undefined);
      },
    });
    await r.channel.start();
    await vi.advanceTimersByTimeAsync(31 * 5_000);
    expect(calls).toBeGreaterThan(30);
    expect(getEventListeners(r.controller.signal, 'abort').length).toBeLessThanOrEqual(1);
    r.channel.stop();
  });
});
