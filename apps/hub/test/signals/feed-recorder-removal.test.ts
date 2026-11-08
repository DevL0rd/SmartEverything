import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventInsert } from '../../src/database/port';
import { SignalBus } from '../../src/signals/bus';
import { recordFeedSignals } from '../../src/signals/feed-recorder';
import { DeviceSignals } from '../../src/signals/sources/device-signals';
import { Inventory } from '../../src/state/inventory';
import { EventRouter } from '../../src/state/event-router';
import { testDatabase, type TestDatabase } from '../support/database';
import { LAMP } from '../support/fake-provider';
import { captureLogs, testLogger } from '../support/logs';

const AT = '2026-11-07T23:39:20.873Z';

let db: TestDatabase;
let inventory: Inventory;
let bus: SignalBus;
let rows: EventInsert[];

beforeEach(async () => {
  captureLogs();
  db = await testDatabase(new Date(AT));
  rows = [];
  const now = (): Date => new Date(AT);
  bus = new SignalBus({ log: testLogger('signals'), now });
  recordFeedSignals({
    signals: bus,
    events: {
      record: (event): void => {
        rows.push(event);
      },
    },
  });
  const signals = new DeviceSignals({ store: db.store, signals: bus, now });
  inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (change): void => {
      signals.lifecycle(change);
    },
  });
});

afterEach(async () => {
  await db.close();
});

describe('a device removal through the queued event chain', () => {
  let router: EventRouter;

  beforeEach(() => {
    router = new EventRouter({
      store: db.database,
      inventory,
      log: testLogger('events'),
      recorded: (): void => undefined,
    });
    recordFeedSignals({ signals: bus, events: router });
  });

  afterEach(async () => {
    await router.close();
  });

  it('stores the removal row with no device row named after the device is gone', async () => {
    await inventory.apply('xiaomi', [LAMP]);
    await router.settled();
    const lamp = inventory.deviceOf('xiaomi', 'lamp-1');
    if (lamp === undefined) throw new Error('The lamp was not in the inventory.');
    await inventory.remove('xiaomi', ['lamp-1']);
    await router.settled();
    const stored = db.store.events.list({ limit: 10 });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ kind: 'signal', device_id: null, occurred_at: AT });
    expect(stored[0]?.details).toMatchObject({ subject: lamp.id, data: { change: 'removed' } });
  });
});

describe('a device removal the store has already carried out', () => {
  it('stores the removal feed row with no device row named and keeps the device in its details', async () => {
    await inventory.apply('xiaomi', [LAMP]);
    const [added] = rows;
    if (added === undefined) throw new Error('The added lifecycle row was not recorded.');
    await db.database.insertEvents([added]);
    const lamp = inventory.deviceOf('xiaomi', 'lamp-1');
    if (lamp === undefined) throw new Error('The lamp was not in the inventory.');
    await inventory.remove('xiaomi', ['lamp-1']);
    expect(db.store.events.list({ limit: 10 })).toStrictEqual([]);
    const removal = rows[1];
    if (removal === undefined) throw new Error('The removed lifecycle row was not recorded.');
    await db.database.insertEvents([removal]);
    const stored = db.store.events.list({ limit: 10 });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ kind: 'signal', device_id: null, occurred_at: AT });
    expect(stored[0]?.details).toMatchObject({ subject: lamp.id, data: { change: 'removed' } });
  });
});
