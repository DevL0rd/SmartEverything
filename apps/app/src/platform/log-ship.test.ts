import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOG_RECORD, type RuntimeLogAck } from '@smarteverything/domain';
import type { LogRecord } from '@smarteverything/logging';

function ackOf(accepted: number): RuntimeLogAck {
  return { stored: accepted, accepted, alreadyStored: 0, overflowed: false };
}

const fixture = vi.hoisted(
  (): {
    storage: Map<string, string>;
    writes: (readonly [string, string])[][];
    removals: string[][];
  } => ({ storage: new Map(), writes: [], removals: [] }),
);

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string): Promise<string | null> =>
      Promise.resolve(fixture.storage.get(key) ?? null),
    setItem: (key: string, value: string): Promise<void> => {
      fixture.storage.set(key, value);
      return Promise.resolve();
    },
    getAllKeys: (): Promise<string[]> => Promise.resolve([...fixture.storage.keys()]),
    multiGet: (keys: readonly string[]): Promise<[string, string | null][]> =>
      Promise.resolve(keys.map((key) => [key, fixture.storage.get(key) ?? null])),
    multiSet: (pairs: readonly (readonly [string, string])[]): Promise<void> => {
      fixture.writes.push([...pairs]);
      for (const [key, value] of pairs) fixture.storage.set(key, value);
      return Promise.resolve();
    },
    multiRemove: (keys: readonly string[]): Promise<void> => {
      fixture.removals.push([...keys]);
      for (const key of keys) fixture.storage.delete(key);
      return Promise.resolve();
    },
  },
}));

vi.mock('./last-exit', () => ({
  readProcessExitLogs: (): Promise<never[]> => Promise.resolve([]),
}));

import { LogShip, logScopeOf, type SendLogBatch } from './log-ship';

const identity = { hub: 'hub', clientId: 'client', profileId: 'profile' };
const outbox = `smarteverything.runtime-log-outbox:${encodeURIComponent(logScopeOf(identity))}`;

function warn(index: number): LogRecord {
  return {
    timestamp: `2026-11-15T08:00:${String(index).padStart(2, '0')}.000Z`,
    runtime: 'app',
    platform: 'web',
    scope: 'app.test',
    level: 'warn',
    event: `test.warned_${String(index)}`,
    payload: { index },
  };
}

function failed(index: number, level: 'warn' | 'info'): LogRecord {
  return {
    timestamp: `2026-11-15T09:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
    runtime: 'app',
    platform: 'web',
    scope: 'app.api',
    level,
    event: level === 'warn' ? 'api.request_failed' : 'api.request_started',
    payload: { index, route: 'GET /fitness/heart', reason: 'x'.repeat(300) },
  };
}

function storedRecords(): { readonly bytes: number; readonly payload: Record<string, unknown> }[] {
  return recordKeys()
    .sort((left, right) => Number(left.split(':').at(-1)) - Number(right.split(':').at(-1)))
    .map((key) => {
      const text = fixture.storage.get(key) ?? '';
      return { bytes: text.length, payload: LOG_RECORD.parse(JSON.parse(text)).payload };
    });
}

function recordKeys(): string[] {
  return [...fixture.storage.keys()].filter((key) => key.startsWith(`${outbox}:record:`));
}

function writtenEvents(pairs: readonly (readonly [string, string])[]): string[] {
  return pairs
    .filter(([key]) => key.startsWith(`${outbox}:record:`))
    .map(([, value]) => LOG_RECORD.parse(JSON.parse(value)).event);
}

beforeEach(() => {
  fixture.storage.clear();
  fixture.writes.length = 0;
  fixture.removals.length = 0;
});

describe('runtime log outbox', () => {
  it('writes a burst of records within one drain window in a single outbox write', async () => {
    const ship = new LogShip(identity);
    for (let index = 0; index < 20; index += 1) ship.record(warn(index));
    await ship.settled();
    expect(fixture.writes).toHaveLength(1);
    expect(writtenEvents(fixture.writes[0] ?? [])).toHaveLength(20);
    expect(recordKeys()).toHaveLength(20);
  });

  it('appends each later record without rewriting the records already kept', async () => {
    const ship = new LogShip(identity);
    for (let index = 0; index < 30; index += 1) {
      ship.record(warn(index));
      await ship.settled();
    }
    expect(fixture.writes.map(writtenEvents)).toEqual(
      Array.from({ length: 30 }, (_, index) => [`test.warned_${String(index)}`]),
    );
    expect(fixture.removals).toEqual([]);
    const restored = new LogShip(identity);
    const sent = vi.fn(() => Promise.resolve(ackOf(30)));
    restored.resume(sent);
    await restored.flush();
    await restored.settled();
    expect(sent).toHaveBeenCalledOnce();
  });

  it('removes only the acknowledged records and restores the rest in order', async () => {
    const ship = new LogShip(identity);
    for (let index = 0; index < 3; index += 1) ship.record(warn(index));
    await ship.settled();
    const kept = recordKeys();
    const send = vi.fn(() => Promise.resolve(ackOf(3)));
    ship.resume(send);
    await ship.flush();
    ship.pause();
    ship.record(warn(3));
    ship.record(warn(4));
    await ship.settled();
    expect(fixture.removals).toEqual([kept]);
    const restored = new LogShip(identity);
    const resent = vi.fn((body: { readonly records: readonly { readonly event: string }[] }) =>
      Promise.resolve(ackOf(body.records.length)),
    );
    restored.resume(resent);
    await restored.flush();
    expect(resent.mock.calls[0]?.[0].records.map((record) => record.event)).toEqual([
      'test.warned_3',
      'test.warned_4',
    ]);
    await restored.settled();
    expect(recordKeys()).toEqual([]);
  });

  it('moves a saved whole-queue outbox into per-record entries once', async () => {
    fixture.storage.set(
      outbox,
      JSON.stringify({
        records: [warn(0), warn(1)].map((record) => ({ ...record, payload: record.payload })),
        gap: { count: 2, from: '2026-11-15T07:00:00.000Z' },
      }),
    );
    const ship = new LogShip(identity);
    const send = vi.fn((body: Parameters<SendLogBatch>[0]) =>
      Promise.resolve(ackOf(body.records.length)),
    );
    ship.resume(send);
    await ship.flush();
    await ship.settled();
    expect(fixture.storage.has(outbox)).toBe(false);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ dropped: 2 });
    expect(send.mock.calls[0]?.[0].records).toHaveLength(2);
    expect([...fixture.storage.keys()].filter((key) => key.startsWith(outbox))).toEqual([]);
  });
});

describe('warning breadcrumb trail', () => {
  it('keeps a 50 warning burst near linear in stored bytes', async () => {
    const lone = new LogShip(identity);
    lone.record(failed(0, 'warn'));
    await lone.settled();
    const single = storedRecords()[0]?.bytes ?? 0;
    fixture.storage.clear();
    const ship = new LogShip(identity);
    for (let index = 0; index < 50; index += 1) {
      ship.record(failed(index, 'info'));
      ship.record(failed(index, 'warn'));
    }
    await ship.settled();
    const stored = storedRecords();
    expect(stored).toHaveLength(50);
    const total = stored.reduce((sum, record) => sum + record.bytes, 0);
    expect(total).toBeLessThan(single * 50 * 3);
  });

  it('carries the trail once and later records only the events logged since', async () => {
    const ship = new LogShip(identity);
    for (let index = 0; index < 3; index += 1) ship.record(failed(index, 'info'));
    ship.record(failed(3, 'warn'));
    ship.record(failed(4, 'warn'));
    ship.record(failed(5, 'info'));
    ship.record(failed(6, 'warn'));
    await ship.settled();
    const [first, second, third] = storedRecords().map(({ payload }) => payload);
    expect(first?.['recent']).toHaveLength(3);
    expect(first?.['recentSince']).toBeUndefined();
    expect(second?.['recent']).toEqual([]);
    expect(second?.['recentSince']).toBe(failed(3, 'warn').timestamp);
    expect(third?.['recent']).toMatchObject([{ event: 'api.request_started', level: 'info' }]);
    expect(third?.['recentSince']).toBe(failed(4, 'warn').timestamp);
  });
});
