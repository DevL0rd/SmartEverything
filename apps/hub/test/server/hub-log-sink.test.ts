import { randomUUID } from 'node:crypto';
import {
  currentExecutionAuthority,
  withExecutionAuthority,
} from '../../src/assistant/turn-authority';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { LogLines } from '../../src/service/log-lines';
import { hubLogSink, ingestOwnLogs, insideLogSink } from '../../src/server/hub-log-sink';
import type { LogStore } from '../../src/logs/log-store';
import { testLogStore } from '../support/log-worker';
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

let logs: LogStore;

const ALL = { owner: true, profileId: null };

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

function diskFull(): Promise<number> {
  return Promise.reject(new Error('the disk is full'));
}

function sinkOf(failed: (cause: unknown) => void = () => undefined): ReturnType<typeof hubLogSink> {
  return hubLogSink({ store: opened.store, logs, failed });
}

beforeEach(async () => {
  opened = await testStore(() => new Date(NOW));
  logs = await testLogStore(opened.directory, opened.store);
  ANNOUNCED.length = 0;
  Logger.reset();
});

afterEach(async () => {
  Logger.reset();
  await logs.close();
  await opened.close();
});

describe('the hub keeping its own log records', () => {
  it('stores what the logger writes under the hub source', async () => {
    const owned = sinkOf();
    owned.sink(record());
    owned.flush();
    await logs.settled();
    const [row] = (await logs.search(ALL, { limit: 10 })).rows;
    expect(row?.source).toBe('hub:service');
    expect(row?.component).toBe('service\u0000hub:service');
    expect(row?.event).toBe('service.started');
  });

  it('makes quiet plugin and hub batches visible under their separate sources', async () => {
    const owned = sinkOf();
    owned.sink(record());
    owned.sink({ ...record('plugin.status'), source: 'plugin:discord', scope: 'hub.plugins' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    await logs.settled();
    const access = ALL;
    expect((await logs.search(access, { source: 'plugin:discord', limit: 5 })).rows).toMatchObject([
      { component: 'plugins\u0000plugin:discord', event: 'plugin.status' },
    ]);
    expect((await logs.sources(access)).sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'plugin:discord', records: 1 }),
        expect.objectContaining({ source: 'hub:service', records: 1 }),
      ]),
    );
  });

  it('stores and indexes exception text exactly as it happened, with the stack frame', async () => {
    const owned = sinkOf();
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
    await logs.settled();
    const access = ALL;
    const [row] = (await logs.search(access, { limit: 10 })).rows;
    expect(row?.payload).toEqual({ attempt: [{ explanation: 'password=examplephrase' }] });
    expect(row?.failure).toEqual({
      name: 'Error',
      message: 'authorization: Bearer examplecredential',
      stack: 'Error: at 192.0.2.1\n    at start (file:///private/service.mjs:24:7)',
    });
    expect((await logs.search(access, { text: 'examplecredential', limit: 10 })).rows).toHaveLength(
      1,
    );
    expect((await logs.search(access, { text: 'examplephrase', limit: 10 })).rows).toHaveLength(1);
  });

  it('keeps writing the log file and reports a store that fails', async () => {
    const failed: unknown[] = [];
    const file = vi.fn();
    vi.spyOn(logs, 'append').mockImplementation(diskFull);
    const owned = sinkOf((cause) => {
      failed.push(cause);
    });
    expect(() => {
      insideLogSink(file, owned.sink)(record());
      owned.flush();
    }).not.toThrow();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(file).toHaveBeenCalledTimes(1);
    expect(String(failed[0])).toContain('the disk is full');
  });

  it('still reaches the live announce when the store write throws', async () => {
    vi.spyOn(logs, 'append').mockImplementation(diskFull);
    const owned = sinkOf();
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

  it('runs beside the sink the service already had and gives it back on stop', async () => {
    const already = vi.fn();
    Logger.configure({ sink: already });
    const stop = ingestOwnLogs({ store: opened.store, logs, log: new Logger('hub.service') });
    new Logger('hub.service').info('service.started');
    stop();
    await logs.settled();
    expect(already).toHaveBeenCalledTimes(1);
    const count = async (): Promise<number> => (await logs.search(ALL, { limit: 10 })).rows.length;
    expect(await count()).toBe(1);
    new Logger('hub.service').info('after.stop');
    await logs.settled();
    expect(already).toHaveBeenCalledTimes(2);
    expect(await count()).toBe(1);
  });

  it('keeps store warnings visible without writing them back into the store', async () => {
    const log = new Logger('hub.service');
    const base = vi.fn<(_: LogRecord) => void>();
    Logger.configure({ sink: base });
    const append = logs.append.bind(logs);
    const calls = vi.spyOn(logs, 'append').mockImplementation((records, source, at) => {
      log.warn('store.statement_slow');
      return append(records, source, at);
    });
    const stop = ingestOwnLogs({ store: opened.store, logs, log });
    for (let index = 0; index < 500; index += 1) {
      log.info('service.started', { index });
    }
    stop();
    await logs.settled();
    expect(calls).toHaveBeenCalledTimes(1);
    expect(
      base.mock.calls.filter(([entry]) => entry.event === 'store.statement_slow'),
    ).toHaveLength(1);
    expect((await logs.search(ALL, { limit: 1 })).rows[0]?.event).toBe('service.started');
  });

  it('reports a failed full batch only once without recursively writing the failure', async () => {
    const log = new Logger('hub.service');
    const base = vi.fn<(_: LogRecord) => void>();
    Logger.configure({ sink: base });
    const calls = vi.spyOn(logs, 'append').mockImplementation(diskFull);
    const stop = ingestOwnLogs({ store: opened.store, logs, log });
    for (let index = 0; index < 500; index += 1) {
      log.info('service.started', { index });
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    stop();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(calls).toHaveBeenCalledTimes(1);
    const failure = base.mock.calls.filter(([entry]) => entry.event === 'logs.not_stored');
    expect(failure).toHaveLength(1);
    expect(failure[0]?.[0].failure?.message).toContain('the disk is full');
  });
});

it('captures repair origin per record before mixed batches flush outside their execution context', async () => {
  const observations: { readonly origin: string | undefined; readonly event: string }[] = [];
  const unobserve = logs.onRepairEvidence((entry) => {
    observations.push({ origin: entry.repairOrigin, event: entry.event });
    expect(currentExecutionAuthority()).toBeUndefined();
  });
  const owned = sinkOf();
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
  await logs.settled();
  expect(observations).toEqual([
    { event: 'promise.unhandled', origin: repairOrigin },
    { event: 'session.failed', origin: undefined },
  ]);
  expect(opened.store.aiRepairInbox.list({ limit: 10 }).groups).toHaveLength(2);
  unobserve();
});
