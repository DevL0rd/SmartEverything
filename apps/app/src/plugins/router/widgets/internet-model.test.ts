import type { RouterSnapshot, SpeedTestResult } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { latestSample, readingLine, runControlOf, testBars } from './internet-model';

const NETWORK: NonNullable<RouterSnapshot['network']> = {
  wanUp: true,
  protocol: 'dhcp',
  publicIp: '203.0.113.24',
  gateway: null,
  dns: [],
  downloadMbps: 215,
  uploadMbps: 21.7,
  lanDownloadMbps: 34,
  lanUploadMbps: 12,
  latencyMs: 12,
  packetLossPercent: 0,
  ports: [],
};

function snapshot(
  connection: RouterSnapshot['connection'],
  network: RouterSnapshot['network'] = NETWORK,
): RouterSnapshot {
  return {
    at: '2026-10-17T13:45:00.000+00:00',
    connection,
    cadence: 'fast',
    intervalSeconds: 2,
    info: null,
    system: null,
    network,
    radios: [],
    stations: [],
    clients: [],
    people: [],
  };
}

function test(day: number, downloadMbps: number): SpeedTestResult {
  return {
    id: `2f8f2c0e-4f4a-4c37-9d5b-0d8c1e5a7b${String(day).padStart(2, '0')}`,
    at: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000+00:00`,
    server: 'Local',
    downloadMbps,
    uploadMbps: 41,
    pingMs: 8,
    jitterMs: 1,
    packetLossPercent: 0,
  };
}

const IDLE = { running: false, line: null } as const;

describe('runControlOf', () => {
  it('lets the speed test run while the router is online and the internet is up', () => {
    expect(runControlOf(snapshot({ state: 'online' }), IDLE)).toEqual({
      kind: 'ready',
      label: 'Run speed test',
    });
  });

  it('shows the live phase while a test runs', () => {
    expect(
      runControlOf(snapshot({ state: 'online' }), {
        running: true,
        line: 'Measuring download… 182 Mb/s',
      }),
    ).toEqual({ kind: 'running', label: 'Measuring download… 182 Mb/s' });
  });

  it('blocks the run with the reason when the router cannot be reached', () => {
    const control = runControlOf(
      snapshot({ state: 'unreachable', reason: 'timeout', since: '2026-10-17T13:40:00.000+00:00' }),
      IDLE,
    );
    expect(control).toEqual({
      kind: 'blocked',
      label: 'Run speed test, unavailable: can’t reach the router',
    });
  });

  it('blocks the run with the reason when the internet is down', () => {
    const control = runControlOf(snapshot({ state: 'online' }, { ...NETWORK, wanUp: false }), IDLE);
    expect(control.label).toBe('Run speed test, unavailable: internet is down');
  });
});

describe('readingLine', () => {
  it('joins latency and the last test and leaves out what is unknown', () => {
    expect(readingLine(snapshot({ state: 'online' }), test(10, 860))).toBe(
      '12 ms · last test 860 Mb/s',
    );
    expect(readingLine(snapshot({ state: 'online' }), null)).toBe('12 ms');
    expect(readingLine(snapshot({ state: 'online' }, null), null)).toBeNull();
  });
});

describe('testBars', () => {
  it('shows the six newest tests oldest first', () => {
    const tests = [10, 9, 8, 7, 6, 5, 4].map((day) => test(day, day * 10));
    expect(testBars(tests).map((bar) => bar.value)).toEqual([50, 60, 70, 80, 90, 100]);
  });
});

describe('latestSample', () => {
  it('is the live reading only while the router is online', () => {
    expect(latestSample(snapshot({ state: 'online' }), 'downloadMbps')).toEqual({
      at: Date.parse('2026-10-17T13:45:00.000+00:00'),
      value: 215,
    });
    expect(latestSample(snapshot({ state: 'paused' }), 'downloadMbps')).toBeNull();
  });
});
