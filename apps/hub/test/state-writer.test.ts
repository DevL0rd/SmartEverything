import type { StateChange } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { EventRouter, type RecordedEvent } from '../src/state/event-router';
import { Inventory } from '../src/state/inventory';
import { StateWriter } from '../src/state/state-writer';
import { FakeDatabase } from './support/fake-database';
import { LAMP } from './support/fake-provider';
import { captureLogs, testLogger } from './support/logs';

async function setup(): Promise<{
  db: FakeDatabase;
  writer: StateWriter;
  changes: StateChange[];
  lampId: string;
  inventory: Inventory;
}> {
  const db = new FakeDatabase();
  const inventory = new Inventory(db, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
  });
  await inventory.apply('xiaomi', [LAMP]);
  const changes: StateChange[] = [];
  const writer = new StateWriter({
    store: db,
    inventory,
    log: testLogger(),
    changed: (change): void => {
      changes.push(change);
    },
  });
  return {
    db,
    writer,
    changes,
    lampId: inventory.deviceOf('xiaomi', 'lamp-1')?.id ?? '',
    inventory,
  };
}

const at = '2026-10-08T10:00:00.000Z';

describe('StateWriter', () => {
  it('writes only values that changed, batched, and reports each change with its previous value', async () => {
    const { db, writer, changes, lampId } = await setup();
    writer.push('xiaomi', {
      externalId: 'lamp-1',
      capability: 'power',
      value: true,
      observedAt: at,
    });
    writer.push('xiaomi', {
      externalId: 'lamp-1',
      capability: 'power',
      value: true,
      observedAt: at,
    });
    writer.push('xiaomi', {
      externalId: 'lamp-1',
      capability: 'brightness',
      value: 40,
      observedAt: at,
    });
    await writer.settled();
    writer.push('xiaomi', {
      externalId: 'lamp-1',
      capability: 'power',
      value: false,
      observedAt: at,
    });
    await writer.settled();
    expect(
      db.stateWrites.map((batch) =>
        batch.map((row) => `${row.capability}=${JSON.stringify(row.value)}`),
      ),
    ).toStrictEqual([['power=true', 'brightness=40'], ['power=false']]);
    expect(changes).toStrictEqual([
      { deviceId: lampId, capability: 'power', value: true, previous: undefined },
      { deviceId: lampId, capability: 'brightness', value: 40, previous: undefined },
      { deviceId: lampId, capability: 'power', value: false, previous: true },
    ]);
    expect(writer.valueOf(lampId, 'power')).toBe(false);
  });

  it('seeds its cache from the stored state so unchanged values are not rewritten after a restart', async () => {
    const { db, writer, lampId } = await setup();
    db.state.set(`${lampId}|power`, {
      deviceId: lampId,
      capability: 'power',
      value: true,
      observedAt: at,
    });
    await writer.load();
    writer.push('xiaomi', {
      externalId: 'lamp-1',
      capability: 'power',
      value: true,
      observedAt: at,
    });
    await writer.settled();
    expect(db.stateWrites).toStrictEqual([]);
  });

  it('forgets values whose write failed so the next identical reading is written again', async () => {
    const logs = captureLogs();
    const { db, writer } = await setup();
    db.failNext = 'upsertState';
    writer.push('xiaomi', {
      externalId: 'lamp-1',
      capability: 'power',
      value: true,
      observedAt: at,
    });
    await writer.settled();
    writer.push('xiaomi', {
      externalId: 'lamp-1',
      capability: 'power',
      value: true,
      observedAt: at,
    });
    await writer.settled();
    expect(db.stateWrites).toHaveLength(1);
    expect(logs.events()).toContain('state.write_failed');
  });

  it('ignores and reports state for a device it does not know', async () => {
    const logs = captureLogs();
    const { writer, changes } = await setup();
    writer.push('xiaomi', {
      externalId: 'ghost',
      capability: 'power',
      value: true,
      observedAt: at,
    });
    expect(changes).toStrictEqual([]);
    expect(logs.events()).toContain('state.device_unknown');
  });
});

function eventRouter(
  db: ConstructorParameters<typeof EventRouter>[0]['store'],
  inventory: ConstructorParameters<typeof EventRouter>[0]['inventory'],
): { readonly router: EventRouter; readonly recorded: RecordedEvent[] } {
  const recorded: RecordedEvent[] = [];
  const router = new EventRouter({
    store: db,
    inventory,
    log: testLogger(),
    recorded: (event): void => {
      recorded.push(event);
    },
  });
  return { router, recorded };
}

describe('EventRouter', () => {
  it('records provider events against the device and reports them with their id', async () => {
    const { db, inventory, lampId } = await setup();
    const { router, recorded } = eventRouter(db, inventory);
    router.fromProvider('xiaomi', {
      externalId: 'lamp-1',
      kind: 'button',
      occurredAt: at,
      details: { press: 'double' },
    });
    await router.settled();
    await Promise.resolve();
    expect(recorded).toStrictEqual([
      {
        id: db.events[0]?.id,
        deviceId: lampId,
        kind: 'button',
        occurredAt: at,
        details: { press: 'double' },
      },
    ]);
  });

  it('drops and reports events for unknown devices and failed writes', async () => {
    const logs = captureLogs();
    const { db, inventory } = await setup();
    const { router, recorded } = eventRouter(db, inventory);
    router.fromProvider('xiaomi', {
      externalId: 'ghost',
      kind: 'motion',
      occurredAt: at,
      details: {},
    });
    db.failNext = 'insertEvents';
    router.record({ deviceId: null, kind: 'automation_run', occurredAt: at, details: {} });
    await router.settled();
    await Promise.resolve();
    expect(recorded).toStrictEqual([]);
    expect(logs.events()).toStrictEqual([
      'event.device_unknown',
      'event.write_failed',
      'event.not_recorded',
    ]);
  });
});
