import { openSeededStore, testStore, type TestStore, closedStore } from '../support/store';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testLogger } from '../support/logs';
import { testStoreHost } from '../support/store-host';

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

describe('openStore', () => {
  it('creates the weather and exchange rate rows while opening', () => {
    expect(opened.store.weather.read().id).toBe('home');
    expect(opened.store.exchangeRates.read().id).toBe('usd');
  });

  it('keeps those rows when the same database is opened again', async () => {
    const before = opened.store.weather.read();
    const again = await openSeededStore({
      host: testStoreHost(),
      path: join(opened.directory, 'test.db'),
      log: testLogger('store'),
      now: () => new Date('2026-10-09T10:00:00.000Z'),
      systemTimeZone: 'UTC',
      driveFolders: null,
    });
    expect(again.weather.read()).toStrictEqual(before);
    await closedStore(again);
  });
});
