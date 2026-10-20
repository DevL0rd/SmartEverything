import type { StateChange, StateUpdate } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { EventRouter, type RecordedEvent } from '../src/state/event-router';
import { Inventory } from '../src/state/inventory';
import { StateWriter } from '../src/state/state-writer';
import type { StateRecord } from '../src/database/port';
import { testDatabase, type TestDatabase } from './support/database';
import { FakeClock } from './support/fake-clock';
import { LAMP } from './support/fake-provider';
import { captureLogs, testLogger } from './support/logs';

const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

async function setup(): Promise<{
  db: TestDatabase;
  stateWrites: (readonly StateRecord[])[];
  writer: StateWriter;
  changes: StateChange[];
  moves: StateChange[];
  clock: FakeClock;
  lampId: string;
  inventory: Inventory;
}> {
  const db = await testDatabase();
  open.push(db);
  const stateWrites: (readonly StateRecord[])[] = [];
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  await inventory.apply('xiaomi', [LAMP]);
  const changes: StateChange[] = [];
  const moves: StateChange[] = [];
  const clock = new FakeClock(at);
  const writer = new StateWriter({
    store: {
      ...db.database,
      upsertState: (rows): Promise<void> => {
        stateWrites.push(rows);
        return db.database.upsertState(rows);
      },
    },
    inventory,
    clock,
    log: testLogger(),
    changed: (change): void => {
      changes.push(change);
    },
    moved: (change): void => {
      moves.push(change);
    },
  });
  return {
    db,
    stateWrites,
    writer,
    changes,
    moves,
    clock,
    lampId: inventory.deviceOf('xiaomi', 'lamp-1')?.id ?? '',
    inventory,
  };
}

const at = '2026-10-08T10:00:00.000Z';

describe('StateWriter', () => {
  it('writes only values that changed, batched, and reports each change with its previous value', async () => {
    const { stateWrites, writer, changes, lampId } = await setup();
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
      stateWrites.map((batch) =>
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
    const { db, stateWrites, writer, lampId } = await setup();
    await db.database.upsertState([
      { deviceId: lampId, capability: 'power', value: true, observedAt: at },
    ]);
    await writer.load();
    writer.push('xiaomi', {
      externalId: 'lamp-1',
      capability: 'power',
      value: true,
      observedAt: at,
    });
    await writer.settled();
    expect(stateWrites).toStrictEqual([]);
  });

  it('keeps reporting and remembering updates while the database is failing, then persists the newest of each', async () => {
    const logs = captureLogs();
    const { db, stateWrites, inventory, changes, lampId } = await setup();
    let down = true;
    const writer = new StateWriter({
      store: {
        loadState: db.database.loadState,
        upsertState: (rows): Promise<void> => {
          if (down) return Promise.reject(new Error('busy'));
          stateWrites.push(rows);
          return db.database.upsertState(rows);
        },
      },
      inventory,
      clock: new FakeClock(at),
      log: testLogger(),
      changed: (change): void => {
        changes.push(change);
      },
      moved: (): void => undefined,
    });
    const push = (
      capability: StateUpdate['capability'],
      value: number | boolean,
      observedAt: string,
    ): void => {
      writer.push('xiaomi', { externalId: 'lamp-1', capability, value, observedAt });
    };
    push('brightness', 10, at);
    await expect(writer.settled()).rejects.toThrow('busy');
    expect(() => {
      push('brightness', 20, '2026-10-08T10:00:01.000Z');
      push('power', true, '2026-10-08T10:00:01.000Z');
      push('brightness', 30, '2026-10-08T10:00:02.000Z');
    }).not.toThrow();
    expect(writer.valueOf(lampId, 'brightness')).toBe(30);
    expect(
      changes.map((change) => `${change.capability}=${JSON.stringify(change.value)}`),
    ).toStrictEqual(['brightness=10', 'brightness=20', 'power=true', 'brightness=30']);
    down = false;
    await writer.settled();
    expect(
      stateWrites.flat().map((row) => `${row.capability}=${JSON.stringify(row.value)}`),
    ).toStrictEqual(['brightness=30', 'power=true']);
    expect(logs.events().filter((event) => event === 'state.write_failed')).toHaveLength(1);
  });

  it('keeps the first value of a device silent for signals and announces every later change, including a value turning unknown', async () => {
    const { writer, changes, moves, lampId } = await setup();
    const push = (value: boolean | null, observedAt: string): void => {
      writer.push('xiaomi', { externalId: 'lamp-1', capability: 'power', value, observedAt });
    };
    push(true, at);
    expect(changes).toHaveLength(1);
    expect(moves).toStrictEqual([]);
    push(null, '2026-10-08T10:00:01.000Z');
    push(false, '2026-10-08T10:00:02.000Z');
    expect(moves).toStrictEqual([
      { deviceId: lampId, capability: 'power', value: null, previous: true },
      { deviceId: lampId, capability: 'power', value: false, previous: null },
    ]);
  });

  it('announces a number once it moved by the capability step and at most every 2 seconds, while the stored value stays exact', async () => {
    const { writer, changes, moves, clock, lampId } = await setup();
    const push = (value: number, observedAt: string): void => {
      writer.push('xiaomi', { externalId: 'lamp-1', capability: 'temperature', value, observedAt });
    };
    push(20, at);
    push(20.05, '2026-10-08T10:00:00.100Z');
    expect(moves).toStrictEqual([]);
    push(20.3, '2026-10-08T10:00:00.200Z');
    expect(moves.map((change) => [change.previous, change.value])).toStrictEqual([[20, 20.3]]);
    clock.advanceTo('2026-10-08T10:00:00.500Z');
    push(20.6, '2026-10-08T10:00:00.500Z');
    push(20.9, '2026-10-08T10:00:01.000Z');
    expect(writer.valueOf(lampId, 'temperature')).toBe(20.9);
    expect(changes.map((change) => change.value)).toStrictEqual([20, 20.05, 20.3, 20.6, 20.9]);
    expect(moves).toHaveLength(1);
    clock.advanceTo('2026-10-08T10:00:02.000Z');
    expect(moves.map((change) => [change.previous, change.value])).toStrictEqual([
      [20, 20.3],
      [20.3, 20.9],
    ]);
  });

  it('stops announcing when it is closed while a number is still waiting', async () => {
    const { writer, moves, clock } = await setup();
    const push = (value: number, observedAt: string): void => {
      writer.push('xiaomi', { externalId: 'lamp-1', capability: 'brightness', value, observedAt });
    };
    push(10, at);
    push(30, '2026-10-08T10:00:00.500Z');
    push(60, '2026-10-08T10:00:01.000Z');
    await writer.close();
    clock.advanceTo('2026-10-08T10:00:10.000Z');
    expect(moves.map((change) => change.value)).toStrictEqual([30]);
  });

  it('reports a change as soon as it is remembered, before the database write finishes', async () => {
    const { stateWrites, writer, changes } = await setup();
    writer.push('xiaomi', {
      externalId: 'lamp-1',
      capability: 'power',
      value: true,
      observedAt: at,
    });
    expect(changes).toHaveLength(1);
    expect(stateWrites).toStrictEqual([]);
    await writer.settled();
    expect(stateWrites).toHaveLength(1);
  });

  it('rewrites an unchanged value only when it was last stored over 30 seconds ago', async () => {
    const { stateWrites, writer, changes } = await setup();
    const push = (observedAt: string): void => {
      writer.push('xiaomi', { externalId: 'lamp-1', capability: 'power', value: true, observedAt });
    };
    push(at);
    await writer.settled();
    push('2026-10-08T10:00:10.000Z');
    push('2026-10-08T10:00:29.000Z');
    await writer.settled();
    expect(stateWrites).toHaveLength(1);
    push('2026-10-08T10:00:31.000Z');
    await writer.settled();
    expect(stateWrites.map((batch) => batch.map((row) => row.observedAt))).toStrictEqual([
      [at],
      ['2026-10-08T10:00:31.000Z'],
    ]);
    expect(changes).toHaveLength(1);
  });

  it('ignores a reading older than the one it already holds', async () => {
    const { stateWrites, writer, changes } = await setup();
    const push = (value: boolean, observedAt: string): void => {
      writer.push('xiaomi', { externalId: 'lamp-1', capability: 'power', value, observedAt });
    };
    push(true, '2026-10-08T10:00:05.000Z');
    push(false, at);
    await writer.settled();
    expect(changes).toHaveLength(1);
    expect(stateWrites.flat()).toHaveLength(1);
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
  database: ConstructorParameters<typeof EventRouter>[0]['store'],
  inventory: ConstructorParameters<typeof EventRouter>[0]['inventory'],
): { readonly router: EventRouter; readonly recorded: RecordedEvent[] } {
  const recorded: RecordedEvent[] = [];
  const router = new EventRouter({
    store: database,
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
    const { router, recorded } = eventRouter(db.database, inventory);
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
        id: db.store.events.list({ limit: 10 })[0]?.id,
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
    const { router, recorded } = eventRouter(db.database, inventory);
    router.fromProvider('xiaomi', {
      externalId: 'ghost',
      kind: 'motion',
      occurredAt: at,
      details: {},
    });
    db.failNext('insertEvents');
    router.record({ deviceId: null, kind: 'automation_run', occurredAt: at, details: {} });
    await router.settled();
    await Promise.resolve();
    expect(recorded).toStrictEqual([]);
    expect(logs.events().filter((event) => event.startsWith('event.'))).toStrictEqual([
      'event.device_unknown',
      'event.write_failed',
      'event.not_recorded',
    ]);
  });
});
