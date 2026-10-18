import type { RouterSnapshot, SpeedTestResult } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { moment } from '../../../format/time';
import type { SpeedTestRun } from '../router-data';
import { routerCellOf, systemReadingsOf } from './router-cell-model';
import { NETWORK_FIXTURE, ROUTER_AT, SYSTEM_FIXTURE, routerSnapshot } from './snapshot-fixture';

const NOW = Date.parse(ROUTER_AT);

function snapshot(
  connection: RouterSnapshot['connection'] = { state: 'online' },
  network: RouterSnapshot['network'] = NETWORK_FIXTURE,
): RouterSnapshot {
  return routerSnapshot(connection, { network });
}

const IDLE: SpeedTestRun = {
  running: false,
  failed: false,
  phase: null,
  mbps: 0,
  pingMs: null,
  reason: null,
  line: null,
};

const LAST: SpeedTestResult = {
  id: '2f8f2c0e-4f4a-4c37-9d5b-0d8c1e5a7b11',
  at: '2026-10-17T11:45:00.000+00:00',
  server: 'Local',
  downloadMbps: 312,
  uploadMbps: 41,
  pingMs: 8,
  jitterMs: 1,
  packetLossPercent: 0,
};

describe('routerCellOf', () => {
  it('reads online with devices, ping and loss, the two rates and the last test', () => {
    const cell = routerCellOf(snapshot(), IDLE, LAST, NOW);
    expect(cell.kind).toBe('online');
    expect(cell.chip).toEqual({ tone: 'positive', label: 'Online' });
    expect(cell.line).toBe('2 devices · 9\u00A0ms · 0 % loss');
    expect(
      cell.figures.map((figure) => `${figure.value} ${figure.unit} ${figure.caption}`),
    ).toEqual(['8.7 Mb/s down', '3.6 Mb/s up']);
    expect(cell.lastTest).toBe(`Test 312 Mb/s ↓ 41 Mb/s ↑ · ${moment(LAST.at, NOW)}`);
    expect(cell.canRun).toBe(true);
    expect(cell.spoken).toBe(
      'Router, online, download 8.7 Mb/s, upload 3.6 Mb/s, 2 devices · 9\u00A0ms · 0 % loss',
    );
  });

  it('leaves the last test out before the first one ran', () => {
    expect(routerCellOf(snapshot(), IDLE, null, NOW).lastTest).toBeNull();
  });

  it('shows the running test with its own line, the figure so far and no second run', () => {
    const run: SpeedTestRun = {
      ...IDLE,
      running: true,
      phase: 'download',
      mbps: 280,
      line: 'Measuring download… 280 Mb/s',
    };
    const cell = routerCellOf(snapshot(), run, LAST, NOW);
    expect(cell.kind).toBe('testing');
    expect(cell.chip.label).toBe('Testing…');
    expect(cell.line).toBe('Measuring download… 280 Mb/s');
    expect(cell.figures).toEqual([{ value: '280', unit: 'Mb/s', caption: 'so far' }]);
    expect(cell.canRun).toBe(false);
    expect(cell.ratio).toBeCloseTo(0.5, 5);
  });

  it('reports no internet as critical while the router itself is fine', () => {
    const cell = routerCellOf(
      snapshot({ state: 'online' }, { ...NETWORK_FIXTURE, wanUp: false }),
      IDLE,
      LAST,
      NOW,
    );
    expect(cell.kind).toBe('down');
    expect(cell.chip).toEqual({ tone: 'critical', label: 'No internet' });
    expect(cell.figures).toEqual([]);
    expect(cell.canRun).toBe(false);
  });

  it('goes stale with the reason, last figures and no actions when unreachable', () => {
    const since = '2026-10-17T13:40:00.000+00:00';
    const cell = routerCellOf(
      snapshot({ state: 'unreachable', reason: 'timeout', since }),
      IDLE,
      LAST,
      NOW,
    );
    expect(cell.kind).toBe('stale');
    expect(cell.chip).toEqual({ tone: 'neutral', label: 'Not reachable' });
    expect(cell.reason).toBe(cell.line);
    expect(cell.line).toContain('Can’t reach the router');
    expect(cell.figures).toHaveLength(2);
    expect(cell.canRun).toBe(false);
    expect(cell.tone).toBe('neutral');
  });

  it.each([
    [{ state: 'paused' } as const, 'Paused', 'warning'],
    [{ state: 'connecting' } as const, 'Connecting…', 'info'],
  ])('names a %j router in its chip', (connection, label, tone) => {
    expect(routerCellOf(snapshot(connection), IDLE, null, NOW).chip).toEqual({ tone, label });
  });

  it('ignores a running test while the router is unreachable', () => {
    const run: SpeedTestRun = { ...IDLE, running: true, phase: 'ping', line: 'Measuring latency…' };
    const cell = routerCellOf(
      snapshot({ state: 'unreachable', reason: 'x', since: ROUTER_AT }),
      run,
      null,
      NOW,
    );
    expect(cell.kind).toBe('stale');
  });
});

describe('systemReadingsOf', () => {
  const SYSTEM = SYSTEM_FIXTURE;

  it('lists CPU, memory and temperature with their words', () => {
    expect(systemReadingsOf(SYSTEM).map((reading) => `${reading.label} ${reading.text}`)).toEqual([
      'CPU 12 %',
      'Memory 39 %',
      'Temp 71.9 °C',
    ]);
  });

  it('leaves the temperature out when the router has no sensor', () => {
    const readings = systemReadingsOf({ ...SYSTEM, temperatureCelsius: null });
    expect(readings.map((reading) => reading.key)).toEqual(['cpu', 'mem']);
  });
});
