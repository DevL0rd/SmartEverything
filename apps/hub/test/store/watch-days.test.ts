import type { WatchSampleBatch } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WatchSampleOwner } from '../../src/store/repositories/watch-days';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;
let owner: WatchSampleOwner;

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  const [device] = test.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId: 'xiaomi_watch:AA',
      parentId: null,
      kind: 'sensor',
      name: 'Watch',
      model: 'xiaomi.watch',
      manufacturer: 'Xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (device === undefined) {
    throw new Error('the watch was not stored');
  }
  owner = { profileId: test.store.profiles.first().id, deviceId: device.id };
});

afterEach(async () => {
  await test.close();
});

const batch = (samples: WatchSampleBatch['samples']): WatchSampleBatch => ({
  kind: 'vitality',
  zoneOffsetSeconds: 0,
  samples,
});

const first = batch([
  { time: '2026-10-08T07:00:00.000Z', value: 70 },
  { time: '2026-10-08T08:00:00.000Z', value: 80 },
]);

function rows(): ReturnType<TestStore['store']['watchDays']['window']> {
  return test.store.watchDays.window(owner.profileId, '2026-10-01', '2026-10-31');
}

describe('watch days', () => {
  it('leaves a day untouched and silent when the watch uploads samples it already has', async () => {
    expect(test.store.watchDays.save(owner, first)).toStrictEqual(['2026-10-08']);
    const stored = rows();
    const changes: string[] = [];
    test.store.feed.subscribe((change) => changes.push(`${change.table} ${change.operation}`));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(test.store.watchDays.save(owner, first)).toStrictEqual([]);
    expect(
      test.store.watchDays.save(owner, batch([{ time: '2026-10-08T08:00:00.000Z', value: 80 }])),
    ).toStrictEqual([]);
    expect(rows()).toStrictEqual(stored);
    expect(changes).toStrictEqual([]);
  });

  it('saves and announces a day once a sample is new or changed', () => {
    test.store.watchDays.save(owner, first);
    const changes: string[] = [];
    test.store.feed.subscribe((change) => changes.push(`${change.table} ${change.operation}`));
    expect(
      test.store.watchDays.save(owner, batch([{ time: '2026-10-08T08:00:00.000Z', value: 85 }])),
    ).toStrictEqual(['2026-10-08']);
    expect(
      test.store.watchDays.save(owner, batch([{ time: '2026-10-08T09:00:00.000Z', value: 90 }])),
    ).toStrictEqual(['2026-10-08']);
    expect(rows()[0]?.samples).toStrictEqual([
      { time: '2026-10-08T07:00:00.000Z', value: 70 },
      { time: '2026-10-08T08:00:00.000Z', value: 85 },
      { time: '2026-10-08T09:00:00.000Z', value: 90 },
    ]);
    expect(changes).toStrictEqual(['watch_days UPDATE', 'watch_days UPDATE']);
  });
});
