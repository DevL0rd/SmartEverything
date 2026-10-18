import type { AdGuardSnapshot } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdGuardClient } from '../../../src/plugins/builtin/adguard/adguard-client';
import { LookupRates, type LookupRate } from '../../../src/plugins/builtin/adguard/lookup-rates';
import { AdGuardMonitor } from '../../../src/plugins/builtin/adguard/monitor';
import { fakeHttp } from '../fake-http';
import { testLogger } from '../../support/logs';

const STATUS = {
  version: 'v0.107.60',
  running: true,
  protection_enabled: true,
  protection_disabled_duration: 0,
};

function statsReply(queries: number, blocked: number): object {
  return {
    num_dns_queries: queries,
    num_blocked_filtering: blocked,
    num_replaced_safebrowsing: 0,
    num_replaced_parental: 0,
    avg_processing_time: 0.001,
    top_queried_domains: [],
    top_blocked_domains: [],
    top_clients: [],
    dns_queries: [queries],
    blocked_filtering: [blocked],
    time_units: 'hours',
  };
}

interface Rig {
  readonly monitor: AdGuardMonitor;
  readonly paths: () => string[];
  readonly recorded: { snapshot: AdGuardSnapshot; rate: LookupRate | null }[];
  readonly published: AdGuardSnapshot[];
}

function rig(): Rig {
  let queries = 0;
  const { fetcher, calls } = fakeHttp({
    'GET /control/status': STATUS,
    'GET /control/stats': () => {
      queries += 10;
      return statsReply(queries, queries / 5);
    },
    'GET /control/clients': { clients: [], auto_clients: [] },
    'GET /control/filtering/status': { filters: [], whitelist_filters: [], user_rules: [] },
  });
  const recorded: Rig['recorded'] = [];
  const published: AdGuardSnapshot[] = [];
  const monitor = new AdGuardMonitor({
    client: new AdGuardClient(
      'http://adguard.test:3000',
      { user: 'person', password: 'x' },
      fetcher,
    ),
    url: 'http://adguard.test:3000',
    log: testLogger('adguard'),
    record: (snapshot, rate): void => {
      recorded.push({ snapshot, rate });
    },
    publish: (snapshot): void => {
      published.push(snapshot);
    },
    protectionChanged: (): void => undefined,
  });
  return { monitor, paths: () => calls.map((call) => call.path), recorded, published };
}

describe('lookup rates', () => {
  it('turns counter growth into per-second rates and skips resets', () => {
    const rates = new LookupRates();
    expect(rates.sample(100, 20, 0)).toBeNull();
    expect(rates.sample(110, 22, 1000)).toEqual({ lookupsPerSecond: 10, blockedPerSecond: 2 });
    expect(rates.sample(115, 22, 3000)).toEqual({ lookupsPerSecond: 2.5, blockedPerSecond: 0 });
    expect(rates.sample(90, 20, 4000)).toBeNull();
    expect(rates.sample(100, 21, 5000)).toEqual({ lookupsPerSecond: 10, blockedPerSecond: 1 });
  });
});

describe('AdGuard recording', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records a lookup rate every second and sends a frame only every minute when unwatched', async () => {
    const { monitor, recorded, published } = rig();
    monitor.setCadence('slow');
    await vi.advanceTimersByTimeAsync(65_000);
    monitor.stop();
    expect(recorded.length).toBeGreaterThanOrEqual(60);
    expect(recorded.filter((entry) => entry.rate !== null).length).toBeGreaterThanOrEqual(59);
    expect(recorded.at(-1)?.rate?.lookupsPerSecond).toBeCloseTo(10, 0);
    expect(published.length).toBeLessThanOrEqual(3);
  });

  it('reads stats every second, status every 10 s and clients and filters every minute', async () => {
    const { monitor, paths } = rig();
    monitor.setCadence('slow');
    await vi.advanceTimersByTimeAsync(65_000);
    monitor.stop();
    const count = (path: string): number => paths().filter((entry) => entry === path).length;
    expect(count('/control/stats')).toBeGreaterThanOrEqual(60);
    expect(count('/control/status')).toBeGreaterThanOrEqual(6);
    expect(count('/control/status')).toBeLessThanOrEqual(8);
    expect(count('/control/clients')).toBe(2);
    expect(count('/control/filtering/status')).toBe(2);
  });

  it('sends every sample while watched', async () => {
    const { monitor, recorded, published } = rig();
    monitor.setCadence('fast');
    await vi.advanceTimersByTimeAsync(10_000);
    monitor.stop();
    expect(published).toHaveLength(recorded.length);
    expect(published.length).toBeGreaterThan(8);
  });
});
