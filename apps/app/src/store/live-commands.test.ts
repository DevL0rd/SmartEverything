import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_ROW, LIVE_CHANGE, type CommandRow } from '@smarteverything/domain';
import { EntityStore } from './entity-store';
import { commandSucceeded, throttledSend } from './live-commands';
import { wired } from '../test-support/live-wire';

const NOW = '2026-10-17T10:00:00.000Z';
const DEVICE_ID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

function command(id: string, status: CommandRow['status']): CommandRow {
  return COMMAND_ROW.parse({
    id,
    device_id: DEVICE_ID,
    capability: 'switch',
    value: true,
    status,
    source: 'app',
    result: null,
    error: null,
    requested_by: null,
    created_at: NOW,
    started_at: NOW,
    finished_at: status === 'pending' ? null : NOW,
    expires_at: '2026-10-17T10:00:30.000Z',
  });
}

let seq = 0;

function change(store: EntityStore, table: string, record: Record<string, unknown>): void {
  seq += 1;
  store.apply(
    wired([
      LIVE_CHANGE.parse({
        seq,
        type: 'change',
        table,
        operation: 'UPDATE',
        record,
        oldRecord: null,
      }),
    ]),
  );
}

describe('commandSucceeded', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
      callback();
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not wake on device state frames while it waits for the command', async () => {
    const store = new EntityStore();
    const row = command(crypto.randomUUID(), 'pending');
    change(store, 'commands', row);
    const reads = vi.spyOn(store, 'get');
    const outcome = commandSucceeded(store, row);
    reads.mockClear();
    for (let index = 0; index < 50; index += 1) {
      change(store, 'device_state', {
        device_id: DEVICE_ID,
        capability: 'temperature',
        value: index,
        observed_at: NOW,
      });
    }
    expect(reads).not.toHaveBeenCalled();
    change(store, 'commands', command(row.id, 'succeeded'));
    expect(await outcome).toBe(true);
  });

  it('reads the finished command at expiry even when no wake arrived', async () => {
    const store = new EntityStore();
    const row = command(crypto.randomUUID(), 'pending');
    change(store, 'commands', row);
    vi.stubGlobal('requestAnimationFrame', (): number => 0);
    const outcome = commandSucceeded(store, row);
    change(store, 'commands', command(row.id, 'succeeded'));
    await vi.advanceTimersByTimeAsync(40_000);
    expect(await outcome).toBe(true);
  });
});

describe('throttledSend', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the first value at once and only the newest value after each interval', async () => {
    const sent: number[] = [];
    const set = throttledSend((value) => {
      sent.push(Number(value));
      return Promise.resolve(true);
    }, 200);
    const results = [1, 2, 3, 4].map((value) => set(value));
    expect(sent).toStrictEqual([1]);
    await vi.advanceTimersByTimeAsync(200);
    expect(sent).toStrictEqual([1, 4]);
    expect(await Promise.all(results)).toStrictEqual([true, true, true, true]);
  });

  it('reports a replaced value as replaced, not as a failure', async () => {
    const set = throttledSend(() => Promise.resolve(false), 200);
    const first = set(1);
    const replaced = set(2);
    const newest = set(3);
    await vi.advanceTimersByTimeAsync(200);
    expect(await replaced).toBe(true);
    expect(await first).toBe(false);
    expect(await newest).toBe(false);
  });

  it('sends again at once after a quiet interval', async () => {
    const sent: number[] = [];
    const set = throttledSend((value) => {
      sent.push(Number(value));
      return Promise.resolve(true);
    }, 200);
    await set(1);
    await vi.advanceTimersByTimeAsync(500);
    await set(2);
    expect(sent).toStrictEqual([1, 2]);
  });
});
