import type { SyncthingSnapshot } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncthingRest } from '../../../src/plugins/builtin/syncthing/rest-client';
import { SyncthingMonitor } from '../../../src/plugins/builtin/syncthing/sync-monitor';
import type { FetchLike } from '../../../src/plugins/builtin/fetch-like';
import { fakeHttp } from '../fake-http';
import { captureLogs } from '../../support/logs';
import { Logger } from '@smarteverything/logging';

interface Rig {
  readonly monitor: SyncthingMonitor;
  readonly recorded: SyncthingSnapshot[];
  readonly published: SyncthingSnapshot[];
  readonly setTotals: (received: number) => void;
  readonly serve: { down: boolean; hang: boolean; requests: number };
}

function monitorWith(): Rig {
  let received = 0;
  const recorded: SyncthingSnapshot[] = [];
  const published: SyncthingSnapshot[] = [];
  const { fetcher: answers } = fakeHttp({
    'GET /rest/system/connections': () => ({
      connections: {},
      total: { inBytesTotal: received, outBytesTotal: received / 2 },
    }),
  });
  const serve = { down: false, hang: false, requests: 0 };
  const fetcher: FetchLike = (input, init) => {
    const path = new URL(input).pathname;
    if (path.startsWith('/rest/events')) return new Promise(() => undefined);
    if (path !== '/rest/system/connections') return answers(input, init);
    serve.requests += 1;
    if (serve.hang) return new Promise(() => undefined);
    if (serve.down) return Promise.reject(new Error('connection refused'));
    return answers(input, init);
  };
  const monitor = new SyncthingMonitor({
    rest: new SyncthingRest('http://st', 'key', fetcher),
    overdueHours: 24,
    log: new Logger('hub.syncthing'),
    record: (snapshot): void => {
      recorded.push(snapshot);
    },
    publish: (snapshot): void => {
      published.push(snapshot);
    },
    publishActivity: (): void => undefined,
    emit: (): void => undefined,
  });
  return {
    monitor,
    recorded,
    published,
    serve,
    setTotals: (value): void => {
      received = value;
    },
  };
}

describe('syncthing transfer rates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports no rates until a baseline exists, then real per-second rates while unwatched', async () => {
    const { monitor, setTotals } = monitorWith();
    monitor.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(monitor.latest.ratesLive).toBe(false);
    setTotals(5_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(monitor.latest.ratesLive).toBe(true);
    expect(monitor.latest.summary.downloadBytesPerSecond).toBe(5_000);
    expect(monitor.latest.summary.uploadBytesPerSecond).toBe(2_500);
    monitor.stop();
  });

  it('records every second but sends a frame only every 10 s while nobody watches', async () => {
    const { monitor, recorded, published } = monitorWith();
    monitor.start();
    await vi.advanceTimersByTimeAsync(30_000);
    monitor.stop();
    expect(recorded.length).toBeGreaterThanOrEqual(30);
    expect(published.length).toBeLessThanOrEqual(5);
  });

  it('sends every sample while watched and a fresh frame the moment the page opens', async () => {
    const { monitor, recorded, published } = monitorWith();
    monitor.start();
    await vi.advanceTimersByTimeAsync(3_000);
    const before = published.length;
    monitor.setWatched(true);
    expect(published.length).toBe(before + 1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(published.length).toBe(before + 6);
    expect(recorded.length).toBeGreaterThanOrEqual(published.length);
    monitor.stop();
  });

  it('never starts a second rate sample while the previous one is still waiting', async () => {
    const { monitor, serve } = monitorWith();
    serve.hang = true;
    monitor.start();
    await vi.advanceTimersByTimeAsync(30_000);
    monitor.stop();
    expect(serve.requests).toBe(1);
  });

  it('logs when the rates stop and when they come back, not on every second in between', async () => {
    const logs = captureLogs();
    const { monitor, serve } = monitorWith();
    monitor.start();
    await vi.advanceTimersByTimeAsync(2_000);
    serve.down = true;
    await vi.advanceTimersByTimeAsync(60_000);
    serve.down = false;
    await vi.advanceTimersByTimeAsync(2_000);
    monitor.stop();
    const events = logs.events().filter((event) => event.startsWith('syncthing.rates_'));
    expect(events).toEqual(['syncthing.rates_failed', 'syncthing.rates_recovered']);
    const recovered = logs.records.find((record) => record.event === 'syncthing.rates_recovered');
    expect(recovered?.payload).toMatchObject({ failedSamples: 60 });
  });
});
