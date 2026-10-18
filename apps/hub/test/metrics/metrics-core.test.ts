import type { DeviceCapability } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MetricHistory } from '../../src/metrics/history';
import { MinuteAccumulator } from '../../src/metrics/minute';
import { MetricRing } from '../../src/metrics/ring';
import { Viewers } from '../../src/metrics/viewers';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const START = Date.parse('2026-10-08T10:00:00.000Z');
const CPU: DeviceCapability = {
  key: 'cpu_load',
  label: 'Processor',
  access: 'read',
  value: { kind: 'number', min: 0, max: 100, step: 1, unit: '%' },
};

let opened: TestStore;
let clock = START;

function computerId(): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'computer:abc',
      parentId: null,
      kind: 'computer',
      name: 'Desk',
      model: 'smarteverything.computer',
      manufacturer: 'Linux',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [CPU],
      details: {},
    },
  ]);
  return row?.id ?? '';
}

beforeEach(async () => {
  captureLogs();
  clock = START;
  opened = await testStore(() => new Date(clock));
});

afterEach(async () => {
  await opened.close();
});

describe('metric ring', () => {
  it('keeps the newest points in order once it wraps', () => {
    const ring = new MetricRing(3);
    [1, 2, 3, 4].forEach((value) => {
      ring.push(value, value * 1000);
    });
    expect(ring.since(0).map((point) => point.value)).toEqual([2, 3, 4]);
    expect(ring.since(3000).map((point) => point.value)).toEqual([3, 4]);
  });
});

describe('minute accumulator', () => {
  it('summarises a minute when the next one starts', () => {
    const minute = new MinuteAccumulator();
    expect(minute.add(10, START)).toBeNull();
    expect(minute.add(30, START + 30_000)).toBeNull();
    expect(minute.add(5, START + 60_000)).toEqual({
      start: START,
      average: 20,
      minimum: 10,
      maximum: 30,
      count: 2,
    });
  });
});

describe('viewers', () => {
  it('tells watchers only when the first viewer arrives and the last one leaves', () => {
    const viewers = new Viewers();
    const seen: boolean[] = [];
    viewers.watch('device:1', (watched) => seen.push(watched));
    viewers.hold('a', [{ target: 'device:1', topic: 'summary' }]);
    viewers.hold('b', [{ target: 'device:1', topic: 'cpu' }]);
    viewers.release('a');
    viewers.release('a');
    expect(viewers.watched('device:1')).toBe(true);
    viewers.release('b');
    expect(seen).toEqual([true, false]);
    expect(viewers.watched('device:1')).toBe(false);
  });

  it('counts leases per target and topic and tells followers only real changes', () => {
    const viewers = new Viewers<string>();
    const seen: string[][] = [];
    viewers.follow('device:1', (demand) => seen.push([...demand.topics].sort()));
    viewers.hold('phone', [{ target: 'device:1', topic: 'cpu' }]);
    viewers.hold('desktop', [
      { target: 'device:1', topic: 'cpu' },
      { target: 'device:1', topic: 'processes', detail: 'window' },
    ]);
    viewers.hold('desktop', [
      { target: 'device:1', topic: 'cpu' },
      { target: 'device:1', topic: 'processes', detail: 'window' },
    ]);
    viewers.hold('phone', [{ target: 'device:2', topic: 'cpu' }]);
    expect(viewers.demand('device:1').details.get('processes')).toEqual(['window']);
    viewers.release('desktop');
    expect(seen).toEqual([['cpu'], ['cpu', 'processes'], []]);
    expect(viewers.watched('device:2')).toBe(true);
  });
});

describe('metric history', () => {
  it('serves seconds from memory and minutes and hours from the store', () => {
    const deviceId = computerId();
    const history = new MetricHistory({
      store: opened.store.deviceMetrics,
      log: testLogger(),
      now: (): Date => new Date(clock),
    });
    for (let second = 0; second <= 3600; second += 30) {
      clock = START + second * 1000;
      history.push(deviceId, 'cpu_load', second < 1800 ? 10 : 50, new Date(clock));
    }
    expect(history.read(deviceId, 'cpu_load', '10m').points).toHaveLength(21);
    const minutes = history.read(deviceId, 'cpu_load', '24h');
    expect(minutes.resolution).toBe('minute');
    expect(minutes.points).toHaveLength(60);
    expect(minutes.points[0]).toMatchObject({ value: 10, minimum: 10, maximum: 10 });
    const hours = history.read(deviceId, 'cpu_load', '30d');
    expect(hours.points).toEqual([
      { at: '2026-10-08T10:00:00.000Z', value: 30, minimum: 10, maximum: 50 },
    ]);
  });

  it('keeps sampled readings out of the state history and answers buckets from metrics', () => {
    const deviceId = computerId();
    const { store } = opened;
    store.state.write([
      { deviceId, capability: 'cpu_load', value: 12, observedAt: new Date(START).toISOString() },
      {
        deviceId,
        capability: 'cpu_load',
        value: 14,
        observedAt: new Date(START + 10_000).toISOString(),
      },
    ]);
    const from = new Date(START - 60_000).toISOString();
    expect(
      store.state.history({ capabilities: ['cpu_load'], from, order: 'asc', limit: 10 }),
    ).toEqual([]);
    store.deviceMetrics.saveMinutes([
      {
        deviceId,
        capability: 'cpu_load',
        bucketStart: new Date(START).toISOString(),
        average: 13,
        minimum: 12,
        maximum: 14,
        count: 2,
      },
    ]);
    const buckets = store.state.buckets({
      capabilities: ['cpu_load'],
      from,
      to: new Date(START + 3_600_000).toISOString(),
      bucketSeconds: 300,
    });
    expect(buckets).toEqual([
      {
        device_id: deviceId,
        capability: 'cpu_load',
        bucket_start: '2026-10-08T10:00:00.000Z',
        count: 2,
        average: 13,
        minimum: 12,
        maximum: 14,
        last: 13,
      },
    ]);
  });
});
