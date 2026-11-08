import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RUNTIME_LOG_BATCH,
  type DesktopServer,
  type RuntimeLogBatch,
} from '@smarteverything/domain';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { outboxPath, readOutbox } from '../src/logs/outbox.js';
import { DesktopLogShipping } from '../src/logs/shipment.js';

const FIRST = { url: 'https://first.example', token: 'first-fixture-token' };
const OTHER = { url: 'https://other.example', token: 'other-fixture-token' };

let directory: string;
let ship: DesktopLogShipping | undefined;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'desktop-log-shipment-'));
  Logger.configure({ sink: () => undefined });
});

afterEach(async () => {
  await ship?.close();
  ship = undefined;
  Logger.reset();
  await rm(directory, { recursive: true, force: true });
});

function record(event: string, scope = 'desktop.test'): LogRecord {
  return {
    timestamp: '2026-11-05T07:00:00.000Z',
    runtime: 'desktop',
    level: 'warn',
    scope,
    event,
    payload: { nested: { detail: 'Authorization: Bearer fixture-secret' } },
  };
}

function transport(accepts: boolean): {
  readonly fetch: typeof fetch;
  readonly requests: readonly { readonly host: string; readonly batch: RuntimeLogBatch }[];
} {
  const requests: { host: string; batch: RuntimeLogBatch }[] = [];
  const fetcher: typeof fetch = (url, init) => {
    if (typeof init?.body !== 'string') throw new Error('Expected the JSON log batch.');
    const batch = RUNTIME_LOG_BATCH.parse(JSON.parse(init.body));
    requests.push({ host: new URL(url instanceof Request ? url.url : url).hostname, batch });
    if (!accepts) return Promise.resolve(new Response('', { status: 503 }));
    return Promise.resolve(
      Response.json({
        stored: batch.records.length,
        accepted: batch.records.length,
        alreadyStored: 0,
        overflowed: false,
      }),
    );
  };
  return { fetch: fetcher, requests };
}

function open(fetcher: typeof fetch, server: DesktopServer): DesktopLogShipping {
  const opened = new DesktopLogShipping({ directory, fetch: fetcher });
  ship = opened;
  opened.follow(server);
  return opened;
}

describe('desktop process log shipping', () => {
  it('keeps a rejected batch on disk and replays it redacted only to the same pairing', async () => {
    const unavailable = transport(false);
    const before = open(unavailable.fetch, FIRST);
    before.record(record('test.first'));
    await vi.waitFor(() => {
      expect(unavailable.requests).toHaveLength(1);
    });
    await before.close();

    const available = transport(true);
    const after = open(available.fetch, OTHER);
    after.record(record('test.second'));
    await vi.waitFor(() => {
      expect(available.requests).toHaveLength(1);
    });
    expect(available.requests[0]?.host).toBe('other.example');
    expect(available.requests[0]?.batch.records.map(({ event }) => event)).toEqual(['test.second']);

    after.follow(FIRST);
    await vi.waitFor(() => {
      expect(available.requests).toHaveLength(2);
    });
    expect(available.requests[1]?.host).toBe('first.example');
    expect(available.requests[1]?.batch.records.map(({ event }) => event)).toEqual(['test.first']);
    expect(JSON.stringify(available.requests)).not.toContain('fixture-secret');
    await vi.waitFor(async () => {
      expect((await readOutbox(outboxPath(directory, FIRST))).entries).toEqual([]);
    });
  });

  it('keeps collecting while disconnected without shipping its own failure logs', async () => {
    const target = transport(true);
    const current = open(target.fetch, FIRST);
    current.pause();
    current.record(record('test.offline'));
    current.record(record('logs.not_sent', 'desktop.log-shipment'));
    await vi.waitFor(async () => {
      const outbox = await readOutbox(outboxPath(directory, FIRST));
      expect(outbox.entries.map((entry) => entry.record.event)).toEqual(['test.offline']);
    });
    expect(target.requests).toEqual([]);
    current.follow(FIRST);
    await vi.waitFor(() => {
      expect(target.requests).toHaveLength(1);
    });
    expect(target.requests[0]?.batch.records.map(({ event }) => event)).toEqual(['test.offline']);
  });
});
