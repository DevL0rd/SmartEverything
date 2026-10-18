import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type HistoryBucket, type HistoryRow } from '@smarteverything/domain';
import { applyToWindows } from './live-invalidations';
import { deviceHistoryKey } from './keys';

interface Call {
  readonly endpoint: string;
  readonly query: {
    readonly capabilities: readonly string[];
    readonly deviceIds?: readonly string[];
    readonly from: string;
    readonly order?: 'asc' | 'desc';
    readonly to?: string;
    readonly bucketSeconds?: number;
    readonly limit?: number;
  };
}

const NOW = Date.parse('2026-10-16T12:00:00.000Z');
const THIS_DEVICE = '00000000-0000-4000-8000-000000000001';
const OTHER_DEVICE = '00000000-0000-4000-8000-000000000002';
const HUB_LIMIT = 5000;

const calls: Call[] = [];
let stored: HistoryRow[] = [];
let buckets: HistoryBucket[] = [];

function serve(call: Call): HistoryRow[] | HistoryBucket[] {
  calls.push(call);
  if (call.endpoint === E.readHistoryBuckets.path) {
    return buckets;
  }
  const matching = stored
    .filter((row) => call.query.capabilities.includes(row.capability))
    .filter((row) => call.query.deviceIds?.includes(row.device_id) ?? true)
    .sort((left, right) => left.id - right.id);
  const ordered = call.query.order === 'desc' ? matching.reverse() : matching;
  return ordered.slice(0, call.query.limit ?? HUB_LIMIT);
}

vi.mock('../api/transport', () => ({
  api: (): { call: (endpoint: { path: string }, input: { query: Call['query'] }) => unknown } => ({
    call: (endpoint, input) =>
      Promise.resolve(serve({ endpoint: endpoint.path, query: input.query })),
  }),
}));

const { bucketSecondsFor, pointsOfBuckets, pointsOfRows, readDeviceBuckets, readDeviceRows } =
  await import('./history');

function row(id: number, deviceId: string, value: number | string): HistoryRow {
  return {
    id,
    device_id: deviceId,
    capability: 'temperature',
    value,
    observed_at: new Date(NOW - (10_000 - id) * 1000).toISOString(),
  };
}

function bucket(start: string, average: number | null): HistoryBucket {
  return {
    device_id: THIS_DEVICE,
    capability: 'temperature',
    bucket_start: start,
    count: 3,
    average,
    minimum: average,
    maximum: average,
    last: average,
  };
}

beforeEach(() => {
  calls.length = 0;
  buckets = [];
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe('the device history queries', () => {
  it('ask the hub for this device only', async () => {
    stored = [row(1, THIS_DEVICE, 20), row(2, OTHER_DEVICE, 99)];
    const rows = await readDeviceRows(THIS_DEVICE, 'temperature', 24);
    expect(rows.map((found) => found.device_id)).toEqual([THIS_DEVICE]);
    expect(calls[0]?.query.deviceIds).toEqual([THIS_DEVICE]);
    expect(calls[0]?.query.capabilities).toEqual(['temperature']);
    expect(calls[0]?.query.from).toBe(new Date(NOW - 24 * 3_600_000).toISOString());
  });

  it('keep the newest readings of a busy home and return them oldest first', async () => {
    stored = Array.from({ length: HUB_LIMIT + 200 }, (_, index) =>
      row(index + 1, index % 2 === 0 ? THIS_DEVICE : OTHER_DEVICE, index),
    );
    const rows = await readDeviceRows(THIS_DEVICE, 'temperature', 24);
    const newest = Math.max(...stored.map((found) => found.id));
    expect(rows.at(-1)?.id).toBe(newest - 1);
    expect(rows.map((found) => found.id)).toEqual(
      [...rows.map((found) => found.id)].sort((a, b) => a - b),
    );
  });

  it('read 7 d and 30 d as one bucket size per range, up to now', async () => {
    buckets = [bucket('2026-10-16T11:00:00.000Z', 21)];
    await expect(readDeviceBuckets(THIS_DEVICE, 'temperature', 168)).resolves.toEqual(buckets);
    await readDeviceBuckets(THIS_DEVICE, 'temperature', 720);
    expect(calls.map((call) => call.endpoint)).toEqual([
      E.readHistoryBuckets.path,
      E.readHistoryBuckets.path,
    ]);
    expect(calls.map((call) => call.query.bucketSeconds)).toEqual([3_600, 14_400]);
    expect(calls[0]?.query.deviceIds).toEqual([THIS_DEVICE]);
    expect(calls[0]?.query.to).toBe(new Date(NOW).toISOString());
    expect(bucketSecondsFor(168)).toBe(3_600);
    expect(bucketSecondsFor(720)).toBe(14_400);
  });

  it('chart only numbers', () => {
    expect(pointsOfRows([row(1, THIS_DEVICE, 20), row(2, THIS_DEVICE, 'on')])).toEqual([
      { t: NOW - 9_999_000, v: 20 },
    ]);
    expect(
      pointsOfBuckets([
        bucket('2026-10-16T11:00:00.000Z', 21),
        bucket('2026-10-16T10:00:00.000Z', null),
      ]),
    ).toEqual([{ t: Date.parse('2026-10-16T11:00:00.000Z'), v: 21 }]);
  });
});

describe('live readings on a device chart', () => {
  it('reach only the chart of the device they belong to', () => {
    const client = new QueryClient();
    const mine = deviceHistoryKey(THIS_DEVICE, 'temperature', 24);
    const theirs = deviceHistoryKey(OTHER_DEVICE, 'temperature', 24);
    client.setQueryData<HistoryRow[]>(mine, []);
    client.setQueryData<HistoryRow[]>(theirs, []);
    const incoming = row(7, THIS_DEVICE, 22);
    applyToWindows(client, [
      {
        type: 'change',
        table: 'state_history',
        operation: 'INSERT',
        record: incoming,
        oldRecord: null,
        seq: 1,
      },
    ]);
    expect(client.getQueryData(mine)).toEqual([incoming]);
    expect(client.getQueryData(theirs)).toEqual([]);
  });
});
