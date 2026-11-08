import { randomUUID } from 'node:crypto';
import {
  currentExecutionAuthority,
  withExecutionAuthority,
} from '../../src/assistant/turn-authority';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { LogLines } from '../../src/service/log-lines';
import { hubLogSink, ingestOwnLogs, insideLogSink } from '../../src/server/hub-log-sink';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-10-08T10:00:00.000Z';

const ANNOUNCED: string[] = [];

vi.mock('../../src/server/live', () => ({
  LiveHub: class {
    announce(message: { readonly lines: readonly string[] }): void {
      ANNOUNCED.push(...message.lines);
    }

    firewall(): undefined {
      return undefined;
    }

    stop(): undefined {
      return undefined;
    }
  },
}));

let opened: TestStore;

function record(event = 'service.started'): LogRecord {
  return {
    timestamp: NOW,
    level: 'info',
    runtime: 'hub',
    scope: 'hub.service',
    event,
    payload: { version: 165 },
  };
}

function diskFull(): never {
  throw new Error('the disk is full');
}

beforeEach(async () => {
  opened = await testStore(() => new Date(NOW));
  ANNOUNCED.length = 0;
  Logger.reset();
});

afterEach(async () => {
  Logger.reset();
  await opened.close();
});

describe('the hub keeping its own log records', () => {
  it('stores what the logger writes under the hub source', () => {
    const owned = hubLogSink({ store: opened.store, failed: () => undefined });
    owned.sink(record());
    owned.flush();
    const [row] = opened.store.runtimeLogs.search(
      { owner: true, profileId: null },
      { limit: 10 },
    ).rows;
    expect(row?.source).toBe('hub:service');
    expect(row?.component).toBe('service\u0000hub:service');
    expect(row?.event).toBe('service.started');
  });

  it('makes quiet plugin and hub batches visible under their separate sources', async () => {
    const owned = hubLogSink({ store: opened.store, failed: () => undefined });
    owned.sink(record());
    owned.sink({ ...record('plugin.status'), source: 'plugin:discord', scope: 'hub.plugins' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const logs = opened.store.runtimeLogs;
    const access = { owner: true, profileId: null };
    expect(logs.search(access, { source: 'plugin:discord', limit: 5 }).rows).toMatchObject([
      { component: 'plugins\u0000plugin:discord', event: 'plugin.status' },
    ]);
    expect(logs.sources(access).sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'plugin:discord', records: 1 }),
        expect.objectContaining({ source: 'hub:service', records: 1 }),
      ]),
    );
  });

  it('stores and indexes exception text exactly as it happened, with the stack frame', () => {
    const owned = hubLogSink({ store: opened.store, failed: () => undefined });
    const source = record('service.start_failed');
    owned.sink({
      ...source,
      level: 'exception',
      payload: { attempt: [{ explanation: 'password=examplephrase' }] },
      failure: {
        name: 'Error',
        message: 'authorization: Bearer examplecredential',
        stack: 'Error: at 192.0.2.1\n    at start (file:///private/service.mjs:24:7)',
      },
    });
    owned.flush();
    const logs = opened.store.runtimeLogs;
    const access = { owner: true, profileId: null };
    const [row] = logs.search(access, { limit: 10 }).rows;
    expect(row?.payload).toEqual({ attempt: [{ explanation: 'password=examplephrase' }] });
    expect(row?.failure).toEqual({
      name: 'Error',
      message: 'authorization: Bearer examplecredential',
      stack: 'Error: at 192.0.2.1\n    at start (file:///private/service.mjs:24:7)',
    });
    expect(logs.search(access, { text: 'examplecredential', limit: 10 }).rows).toHaveLength(1);
    expect(logs.search(access, { text: 'examplephrase', limit: 10 }).rows).toHaveLength(1);
  });

  it('keeps writing the log file and reports a store that throws', () => {
    const failed: unknown[] = [];
    const file = vi.fn();
    vi.spyOn(opened.store.runtimeLogs, 'append').mockImplementation(diskFull);
    const owned = hubLogSink({
      store: opened.store,
      failed: (cause) => {
        failed.push(cause);
      },
    });
    expect(() => {
      insideLogSink(file, owned.sink)(record());
      owned.flush();
    }).not.toThrow();
    expect(file).toHaveBeenCalledTimes(1);
    expect(String(failed[0])).toContain('the disk is full');
  });

  it('still reaches the live announce when the store write throws', async () => {
    vi.spyOn(opened.store.runtimeLogs, 'append').mockImplementation(diskFull);
    const owned = hubLogSink({ store: opened.store, failed: () => undefined });
    const lines = new LogLines();
    lines.listen((written) => {
      ANNOUNCED.push(...written);
    });
    insideLogSink((entry) => {
      lines.write(JSON.stringify(entry));
    }, owned.sink)(record());
    owned.flush();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(ANNOUNCED).toHaveLength(1);
    expect(ANNOUNCED[0]).toContain('service.started');
  });

  it('runs beside the sink the service already had and gives it back on stop', () => {
    const already = vi.fn();
    Logger.configure({ sink: already });
    const stop = ingestOwnLogs({ store: opened.store, log: new Logger('hub.service') });
    new Logger('hub.service').info('service.started');
    stop();
    expect(already).toHaveBeenCalledTimes(1);
    const count = (): number =>
      opened.store.runtimeLogs.search({ owner: true, profileId: null }, { limit: 10 }).rows.length;
    expect(count()).toBe(1);
    new Logger('hub.service').info('after.stop');
    expect(already).toHaveBeenCalledTimes(2);
    expect(count()).toBe(1);
  });

  it('keeps store warnings visible without writing them back into the store', () => {
    const log = new Logger('hub.service');
    const base = vi.fn<(_: LogRecord) => void>();
    Logger.configure({ sink: base });
    const repository = opened.store.runtimeLogs;
    const append = repository.append.bind(repository);
    const calls = vi.spyOn(repository, 'append').mockImplementation((records, clientId) => {
      log.warn('store.statement_slow');
      return append(records, clientId);
    });
    const stop = ingestOwnLogs({ store: opened.store, log });
    for (let index = 0; index < 500; index += 1) {
      log.info('service.started', { index });
    }
    stop();
    expect(calls).toHaveBeenCalledTimes(1);
    expect(
      base.mock.calls.filter(([entry]) => entry.event === 'store.statement_slow'),
    ).toHaveLength(1);
    expect(repository.search({ owner: true, profileId: null }, { limit: 1 }).rows[0]?.event).toBe(
      'service.started',
    );
  });

  it('reports a failed full batch only once without recursively writing the failure', () => {
    const log = new Logger('hub.service');
    const base = vi.fn<(_: LogRecord) => void>();
    Logger.configure({ sink: base });
    const calls = vi.spyOn(opened.store.runtimeLogs, 'append').mockImplementation(diskFull);
    const stop = ingestOwnLogs({ store: opened.store, log });
    for (let index = 0; index < 500; index += 1) {
      log.info('service.started', { index });
    }
    stop();
    expect(calls).toHaveBeenCalledTimes(1);
    const failure = base.mock.calls.filter(([entry]) => entry.event === 'logs.not_stored');
    expect(failure).toHaveLength(1);
    expect(failure[0]?.[0].failure?.message).toContain('the disk is full');
  });
});

it('captures repair origin per record before mixed batches flush outside their execution context', async () => {
  const observations: { readonly origin: string | undefined; readonly event: string }[] = [];
  const unobserve = opened.store.runtimeLogs.onRepairEvidence((entry) => {
    observations.push({ origin: entry.repairOrigin, event: entry.event });
    expect(currentExecutionAuthority()).toBeUndefined();
  });
  const owned = hubLogSink({ store: opened.store, failed: () => undefined });
  const repairOrigin = randomUUID();
  const authority = {
    event_id: repairOrigin,
    profile_id: randomUUID(),
    client_id: null,
    kind: 'service' as const,
    role: 'owner' as const,
    hub_os_ban: true,
    tools: null,
    plugin_id: null,
    requester: null,
    repair_origin: repairOrigin,
  };
  const failure = { name: 'Error', message: 'example failure' };
  withExecutionAuthority(authority, () => {
    owned.sink({ ...record('promise.unhandled'), level: 'exception', failure });
  });
  owned.sink({ ...record('session.failed'), scope: 'hub.harness', level: 'error', failure });
  withExecutionAuthority(authority, () => {
    owned.flush();
  });
  await Promise.resolve();
  expect(observations).toEqual([
    { event: 'promise.unhandled', origin: repairOrigin },
    { event: 'session.failed', origin: undefined },
  ]);
  expect(opened.store.aiRepairInbox.list({ limit: 10 }).groups).toHaveLength(2);
  unobserve();
});
