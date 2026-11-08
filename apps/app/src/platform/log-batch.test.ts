import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ENDPOINTS as E, LOG_RECORD, type RuntimeLogRecord } from '@smarteverything/domain';
import { Logger, shippedRecord, type LogRecord } from '@smarteverything/logging';

const storage = vi.hoisted(() => new Map<string, string>());

const transport = vi.hoisted(
  (): {
    calls: { records: readonly RuntimeLogRecord[]; dropped: number }[];
    refuses: boolean;
    reached: (() => void) | null;
    wait: Promise<void> | null;
    partial: boolean;
  } => ({
    calls: [],
    refuses: false,
    reached: null,
    wait: null,
    partial: false,
  }),
);

async function send(body: Parameters<SendLogBatch>[0]): ReturnType<SendLogBatch> {
  if (transport.refuses) throw new Error('the hub is not there');
  transport.calls.push({ records: body.records, dropped: body.dropped ?? 0 });
  transport.reached?.();
  await transport.wait;
  const accepted = transport.partial ? 0 : body.records.length;
  return { stored: accepted, accepted, alreadyStored: 0, overflowed: false };
}

function gate(): { readonly promise: Promise<void>; readonly open: () => void } {
  let open: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    promise,
    open: (): void => {
      open?.();
    },
  };
}

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string): Promise<string | null> => Promise.resolve(storage.get(key) ?? null),
    setItem: (key: string, value: string): Promise<void> => {
      storage.set(key, value);
      return Promise.resolve();
    },
  },
}));

import {
  BATCH_BYTES,
  OFFLINE_BUFFER_BYTES,
  batchFrom,
  queued,
  sizeOf,
  withinBuffer,
} from '../../src/platform/log-batch';
import { readLogOutbox, writeLogOutbox } from '../../src/platform/log-offload';
import { activateFlags } from '../../src/developer/flags';
import { allOff } from '../../src/developer/toggles';
import { shipLevelOf, wantsShipped } from '../../src/platform/ship-level';
import {
  LogShip,
  bindLogShipping,
  logScopeOf,
  shipLog,
  type SendLogBatch,
} from '../../src/platform/log-ship';

const OWNER = { hub: 'house', clientId: 'device', profileId: 'owner' };
const SCOPE = logScopeOf(OWNER);

function record(index: number, detail = 'x'): RuntimeLogRecord {
  return {
    timestamp: new Date(Date.UTC(2026, 10, 5, 9, 0, index)).toISOString(),
    runtime: 'app',
    platform: 'android',
    scope: 'app.cameras',
    event: 'capture.opened',
    level: 'info',
    payload: { index, detail },
  };
}

function logged(
  index: number,
  level: RuntimeLogRecord['level'] = 'info',
  detail: Readonly<Record<string, unknown>> = {},
): LogRecord {
  return {
    timestamp: record(index).timestamp,
    runtime: 'app',
    platform: 'android',
    scope: 'app.cameras',
    event: 'capture.opened',
    level,
    payload: { index, ...detail },
  };
}

function sent(
  index: number,
  level: RuntimeLogRecord['level'] = 'info',
  detail: Readonly<Record<string, unknown>> = {},
): RuntimeLogRecord {
  const context = wantsShipped(level, 'warn') ? { screen: 'start', recent: [] } : {};
  return LOG_RECORD.parse(shippedRecord(logged(index, level, { ...detail, ...context })));
}

beforeEach(() => {
  vi.useFakeTimers();
  storage.clear();
  transport.calls.length = 0;
  transport.refuses = false;
  transport.reached = null;
  transport.wait = null;
  transport.partial = false;
});

afterEach(() => {
  Logger.reset();
  activateFlags(allOff());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the app keeping records until the hub is back', () => {
  it('keeps within a bound in bytes, measured as the records are, not a count', () => {
    const one = sent(1, 'info', { detail: 'a '.repeat(2000) });
    expect(queued(one).bytes).toBe(new TextEncoder().encode(JSON.stringify(one)).length);
    expect(queued(one).bytes).toBeGreaterThan(2000);
    const many = Array.from({ length: 2000 }, (_, index) =>
      queued(sent(index, 'info', { detail: 'b '.repeat(2000) })),
    );
    const kept = withinBuffer(many);
    expect(sizeOf(kept)).toBeLessThanOrEqual(OFFLINE_BUFFER_BYTES);
    expect(sizeOf(kept)).toBeGreaterThan(OFFLINE_BUFFER_BYTES - 2500);
    expect(kept.at(-1)?.record.timestamp).toBe(many.at(-1)?.record.timestamp);
  });

  it('sends at most one batch of the measured size and names the oldest record it carries', () => {
    const many = Array.from({ length: 400 }, (_, index) =>
      queued(sent(index, 'info', { detail: 'c '.repeat(1000) })),
    );
    expect(many[0]?.bytes).toBeGreaterThan(1000);
    const batch = batchFrom(many);
    expect(batch[0]?.record.timestamp).toBe(many[0]?.record.timestamp);
    expect(batch.length).toBeGreaterThan(0);
    expect(sizeOf(batch)).toBeLessThanOrEqual(BATCH_BYTES);
    expect(batch.length).toBeLessThanOrEqual(400);
  });

  it('holds nothing to send when nothing was kept', () => {
    expect(batchFrom([])).toEqual([]);
  });
});

describe('the level at which the app sends its records', () => {
  it('sends warnings, errors and exceptions until a developer chooses otherwise', () => {
    expect(shipLevelOf({})).toBe('warn');
    expect(wantsShipped('info', 'warn')).toBe(false);
    expect(wantsShipped('warn', 'warn')).toBe(true);
    expect(wantsShipped('exception', 'warn')).toBe(true);
    expect(wantsShipped('error', 'warn')).toBe(true);
    expect(wantsShipped('debug', 'warn')).toBe(false);
    expect(wantsShipped('debug', 'debug')).toBe(true);
  });

  it('follows the chosen flag, so a quiet choice sends the least', () => {
    expect(shipLevelOf({ 'log.ship.info': true })).toBe('info');
    expect(shipLevelOf({ 'log.ship.debug': true })).toBe('debug');
    expect(shipLevelOf({ 'log.ship.trace': true })).toBe('trace');
    expect(wantsShipped('debug', 'debug')).toBe(true);
  });
});

describe('what the app remembers before a failure', () => {
  it('carries the events that led to a failure, with their detail, not just the page', async () => {
    const ship = new LogShip(OWNER);
    ship.start();
    ship.pause();
    ship.record(logged(1, 'info', { page: 'drive' }));
    ship.record(logged(2, 'warn', { slowMs: 1200 }));
    ship.record(logged(3, 'error', { failed: true }));
    ship.resume(send);
    await ship.flush();
    const shipped = transport.calls.flatMap((call) => call.records).at(-1);
    expect(shipped?.payload?.['recent']).toEqual([
      {
        at: logged(1).timestamp,
        scope: 'app.cameras',
        event: 'capture.opened',
        screen: 'start',
        level: 'info',
        detail: '{"index":1,"page":"drive"}',
      },
      {
        at: logged(2).timestamp,
        scope: 'app.cameras',
        event: 'capture.opened',
        screen: 'start',
        level: 'warn',
        detail: '{"index":2,"slowMs":1200}',
      },
    ]);
    ship.stop();
  });

  it('keeps the newest events when far more happened than it holds', () => {
    const ship = new LogShip(OWNER);
    ship.start();
    ship.pause();
    for (let index = 0; index < 60; index += 1) ship.record(logged(index, 'info'));
    ship.record(logged(60, 'error'));
    const [queuedRecord] = transport.calls;
    expect(queuedRecord).toBeUndefined();
    const trail = (ship as unknown as { recent: readonly { detail?: string }[] }).recent;
    expect(trail.length).toBe(40);
    expect(trail.at(-1)?.detail).toBe('{"index":60}');
    ship.stop();
  });
});

describe('draining the kept records to the hub', () => {
  it('keeps disconnected records private to the original hub, device and profile', async () => {
    const original = new LogShip(OWNER);
    original.record(logged(3, 'error'));
    await original.settled();
    for (const other of [
      { ...OWNER, profileId: 'visitor' },
      { ...OWNER, clientId: 'other-device' },
      { ...OWNER, hub: 'other-house' },
    ]) {
      const ship = new LogShip(other);
      ship.resume(send);
      await ship.flush();
      ship.stop();
    }
    expect(transport.calls).toEqual([]);
    expect((await readLogOutbox(SCOPE)).records).toEqual([sent(3, 'error')]);
    original.resume(send);
    await original.flush();
    expect(transport.calls.flatMap((call) => call.records)).toEqual([sent(3, 'error')]);
    original.stop();
  });

  it('does not take records after a binding goes stale before the effect switches', async () => {
    let current = true;
    const close = bindLogShipping(OWNER, () => current, send);
    shipLog(logged(1, 'error'));
    current = false;
    shipLog(logged(2, 'error'));
    await vi.advanceTimersByTimeAsync(0);
    close();
    expect(transport.calls.flatMap((call) => call.records)).toEqual([sent(1, 'error')]);
  });

  it('stops the old drain after a profile switch while an upload is in flight', async () => {
    const original = new LogShip(OWNER);
    const reached = gate();
    const waiting = gate();
    const started = gate();
    const detail = { a: 'test sample '.repeat(160), b: 'second sample '.repeat(140) };
    const ownerSends: string[] = [];
    const visitorSends: string[] = [];
    const oldSender: SendLogBatch = async (batch) => {
      ownerSends.push(batch.profileId);
      reached.open();
      await waiting.promise;
      return send(batch);
    };
    const visitor = { ...OWNER, profileId: 'visitor' };
    const next = new LogShip(visitor);
    next.resume(async (batch) => {
      visitorSends.push(batch.profileId);
      started.open();
      return send(batch);
    });
    for (let index = 0; index < 100; index += 1) original.record(logged(index, 'error', detail));
    original.resume(oldSender);
    const draining = original.flush();
    await reached.promise;
    original.pause();
    next.record(logged(101, 'error'));
    const newer = next.flush();
    await started.promise;
    waiting.open();
    await Promise.all([draining, newer]);
    expect(ownerSends).toEqual(['owner']);
    expect(visitorSends).toEqual(['visitor']);
    expect((await readLogOutbox(SCOPE)).records.length).toBeGreaterThan(0);
    original.stop();
    next.stop();
  });

  it('keeps records through a failed send and an app restart until acknowledged', async () => {
    const ship = new LogShip(OWNER);
    ship.start();
    ship.record(logged(2, 'error'));
    ship.record(logged(3));
    expect(ship.pending).toBe(1);
    transport.refuses = true;
    ship.resume(send);
    await ship.flush();
    expect(transport.calls).toEqual([]);
    expect((await readLogOutbox(SCOPE)).records).toEqual([sent(2, 'error')]);
    ship.stop();

    transport.refuses = false;
    const restarted = new LogShip(OWNER);
    restarted.start();
    restarted.resume(send);
    await restarted.flush();
    expect(transport.calls.flatMap((call) => call.records)).toEqual([sent(2, 'error')]);
    expect((await readLogOutbox(SCOPE)).records).toEqual([]);
    expect(restarted.buffered).toBe(0);
    restarted.stop();
  });

  it('keeps native upload diagnostics out of the shipment they describe', async () => {
    const ship = new LogShip(OWNER);
    const { method, path: route } = E.ingestRuntimeLogs;
    const upload = {
      ...logged(1, 'warn', { nativeScope: 'hub-client', method, route }),
      scope: 'app.native',
      event: 'request.transport_failed',
    };

    ship.record(upload);
    expect(ship.pending).toBe(0);
    ship.record({ ...upload, payload: { ...upload.payload, method: 'GET' } });
    ship.record({ ...upload, payload: { ...upload.payload, route: '/api/health' } });
    expect(ship.pending).toBe(2);
    await ship.settled();
  });

  it('leaves the batch on disk when the hub acknowledges only part of it', async () => {
    await writeLogOutbox(SCOPE, { records: [sent(10, 'exception')], gap: null });
    const ship = new LogShip(OWNER);
    ship.start();
    ship.resume(send);
    transport.partial = true;
    await ship.flush();
    expect((await readLogOutbox(SCOPE)).records).toEqual([sent(10, 'exception')]);
    transport.partial = false;
    await ship.flush();
    expect((await readLogOutbox(SCOPE)).records).toEqual([]);
    ship.stop();
  });

  it('protects in-flight records and sends newer records after an overflow', async () => {
    const ship = new LogShip(OWNER);
    const waiting = gate();
    const sending = gate();
    transport.wait = waiting.promise;
    transport.reached = sending.open;
    ship.start();
    ship.resume(send);
    ship.record(logged(0, 'error'));
    const first = ship.flush();
    await sending.promise;
    const detail = { a: 'test sample '.repeat(160), b: 'second sample '.repeat(140) };
    for (let index = 1; index <= 300; index += 1) {
      ship.record(logged(index, 'error', detail));
    }
    expect(ship.buffered).toBeLessThanOrEqual(OFFLINE_BUFFER_BYTES);
    waiting.open();
    await first;
    await ship.flush();
    const indexes = transport.calls.flatMap((call) =>
      call.records.map((item) => item.payload?.['index']),
    );
    expect(indexes[0]).toBe(0);
    expect(indexes.at(-1)).toBe(300);
    expect(new Set(indexes).size).toBe(indexes.length);
    expect(transport.calls.reduce((count, call) => count + call.dropped, 0) + indexes.length).toBe(
      301,
    );
    ship.stop();
  });

  it('keeps shipping diagnostics local when every log level is enabled', async () => {
    activateFlags({ ...allOff(), 'log.ship.trace': true, 'log.level.trace': true });
    const ship = new LogShip(OWNER);
    ship.start();
    ship.resume(send);
    Logger.configure({
      level: 'trace',
      context: { platform: 'android' },
      sink: (entry) => {
        ship.record(entry);
      },
    });
    new Logger('app.cameras').trace('camera.opened');
    new Logger('app.log-ship').warn('logs.not_sent');
    await ship.flush();
    expect(transport.calls.flatMap((call) => call.records).map((item) => item.event)).toEqual([
      'camera.opened',
    ]);
    expect(ship.pending).toBe(0);
    ship.stop();
  });

  it('keeps a payload field whether or not its name looks like a secret', () => {
    const kept: RuntimeLogRecord[] = [];
    Logger.configure({
      level: 'trace',
      sink: (entry) => {
        const shipped = LOG_RECORD.safeParse(entry);
        if (shipped.success) {
          kept.push(shipped.data);
        }
      },
      context: { platform: 'android' },
    });
    new Logger('app.cameras').error('camera.failed', new Error('refused'), {
      password: 'hunter2',
      apiKey: 'sk-live',
    });
    Logger.reset();
    expect(kept).toHaveLength(1);
    expect(kept[0]?.payload).toEqual({ password: 'hunter2', apiKey: 'sk-live' });
  });

  it('ships what the logger sink hands it, platform and all, without a second logging path', async () => {
    const ship = new LogShip(OWNER);
    ship.start();
    ship.pause();
    Logger.configure({
      level: 'trace',
      sink: (entry) => {
        ship.record(entry);
      },
      context: { platform: 'android', release: '0.1.0' },
    });
    new Logger('app.cameras').error('camera.failed', new Error('refused'), { password: 'hunter2' });
    Logger.reset();
    expect(ship.pending).toBe(1);
    ship.resume(send);
    await ship.flush();
    const shipped = transport.calls.flatMap((call) => call.records);
    expect(shipped).toHaveLength(1);
    expect(shipped[0]?.platform).toBe('android');
    expect(shipped[0]?.failure?.name).toBe('Error');
    expect(LOG_RECORD.safeParse(shipped[0]).success).toBe(true);
    expect(shipped[0]?.payload).toMatchObject({ password: 'hunter2' });
    ship.stop();
  });

  it('leaves a record it cannot place with a platform out of the queue instead of throwing', () => {
    const ship = new LogShip(OWNER);
    ship.start();
    ship.pause();
    const placed = logged(4, 'error');
    const { platform: _platform, ...unplaced } = placed;
    ship.record(unplaced);
    expect(ship.pending).toBe(0);
    ship.stop();
  });

  it('does not ship until the app is live again', async () => {
    const ship = new LogShip(OWNER);
    ship.start();
    ship.record(logged(1, 'error'));
    await ship.flush();
    expect(transport.calls).toEqual([]);
    ship.resume(send);
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.calls).toHaveLength(1);
    ship.stop();
  });
});
