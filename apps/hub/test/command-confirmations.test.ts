import { randomUUID } from 'node:crypto';
import { setImmediate as nextTurn } from 'node:timers/promises';
import type { JsonValue } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { finishAutomationCommands } from '../src/automations/command-submission';
import { commandBudgetMs, COMMAND_WAIT_MS } from '../src/commands/command-budgets';
import { CommandConfirmations } from '../src/commands/command-confirmations';
import { CommandExecutor } from '../src/commands/executor';
import { IntendedValues } from '../src/commands/intended-values';
import { DeviceDriverRegistry } from '../src/local/device-driver';
import { Inventory } from '../src/state/inventory';
import { testDatabase, type TestDatabase } from './support/database';
import { closeSetups, NOW, setup } from './support/executor-setup';
import { FakeClock } from './support/fake-clock';
import { LAMP } from './support/fake-provider';
import { captureLogs, testLogger } from './support/logs';

const SECOND = 1_000;
const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
  await closeSetups();
});

function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

interface Rig {
  readonly db: TestDatabase;
  readonly clock: FakeClock;
  readonly confirmations: CommandConfirmations;
  readonly executor: CommandExecutor;
  readonly lamp: string;
}

async function rig(): Promise<Rig> {
  const db = await testDatabase(NOW);
  open.push(db);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  await inventory.apply('local', [{ ...LAMP, provider: 'local', externalId: 'quick:lamp' }]);
  const drivers = new DeviceDriverRegistry();
  drivers.register({
    id: 'quick',
    start: (): Promise<() => Promise<void>> => Promise.resolve(() => Promise.resolve()),
    execute: (): Promise<JsonValue> => Promise.resolve(null),
  });
  const clock = new FakeClock(NOW.toISOString());
  const confirmations = new CommandConfirmations({
    store: db.store,
    clock,
    log: testLogger('commands'),
  });
  const executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers,
    adapters: { adapterFor: (): undefined => undefined },
    hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
    log: testLogger(),
    now: clock.now,
    confirmations,
  });
  const lamp = inventory.deviceOf('local', 'quick:lamp')?.id ?? '';
  return { db, clock, confirmations, executor, lamp };
}

function brightness(home: Rig, value: number, offsetMs: number): void {
  home.db.store.state.write([
    { deviceId: home.lamp, capability: 'brightness', value, observedAt: at(offsetMs) },
  ]);
}

async function send(home: Rig, value: number): Promise<string> {
  const [row] = home.db.store.commands.insert([
    { deviceId: home.lamp, capability: 'brightness', value, source: 'app', requestedBy: null },
  ]);
  if (row === undefined) throw new Error('no command');
  await home.executor.run(row);
  return row.id;
}

describe('a sent command is confirmed by the device state, never by waiting', () => {
  it('finishes as soon as it is sent and clears the safety net when the state arrives', async () => {
    const home = await rig();
    const logs = captureLogs();
    brightness(home, 10, -SECOND);
    const id = await send(home, 40);
    expect(home.db.store.commands.byId(id).status).toBe('succeeded');
    expect(home.clock.pending()).toStrictEqual([at(COMMAND_WAIT_MS)]);
    brightness(home, 40, 200);
    expect(home.clock.pending()).toStrictEqual([]);
    expect(logs.events()).toContain('command.confirmed');
    expect(logs.events()).not.toContain('command.not_confirmed');
  });

  it('logs command.not_confirmed once when no matching state arrives within the budget', async () => {
    const home = await rig();
    const logs = captureLogs();
    brightness(home, 10, -SECOND);
    await send(home, 40);
    brightness(home, 10, 100);
    home.clock.advanceTo(at(COMMAND_WAIT_MS));
    const missed = logs.records.filter((record) => record.event === 'command.not_confirmed');
    expect(missed).toHaveLength(1);
    expect(missed[0]?.level).toBe('warn');
    expect(home.clock.pending()).toStrictEqual([]);
  });

  it('does not count a frame observed before the send as the confirmation', async () => {
    const home = await rig();
    brightness(home, 10, -SECOND);
    home.confirmations.expect({
      commandId: randomUUID(),
      deviceId: home.lamp,
      capability: 'brightness',
      value: 40,
      sentAt: NOW.getTime(),
      budgetMs: COMMAND_WAIT_MS,
    });
    brightness(home, 40, -1);
    expect(home.clock.pending()).toHaveLength(1);
  });

  it('arms nothing when the device already shows the sent value', async () => {
    const home = await rig();
    brightness(home, 40, -SECOND);
    await send(home, 40);
    expect(home.clock.pending()).toStrictEqual([]);
  });
});

function cleaning(home: Rig, value: string, offsetMs: number): void {
  home.db.store.state.write([
    { deviceId: home.lamp, capability: 'cleaning', value, observedAt: at(offsetMs) },
  ]);
}

function expectCleaning(home: Rig, value: string): void {
  home.confirmations.expect({
    commandId: randomUUID(),
    deviceId: home.lamp,
    capability: 'cleaning',
    value,
    sentAt: NOW.getTime(),
    budgetMs: COMMAND_WAIT_MS,
  });
}

describe('a robot cleaning command is confirmed by the reading it causes', () => {
  it('confirms a resume by cleaning and a dock by returning, with no false warning', async () => {
    const home = await rig();
    const logs = captureLogs();
    cleaning(home, 'paused', -SECOND);
    expectCleaning(home, 'resume');
    cleaning(home, 'cleaning', 900);
    expect(home.clock.pending()).toStrictEqual([]);
    expectCleaning(home, 'dock');
    cleaning(home, 'returning', 1_100);
    expect(home.clock.pending()).toStrictEqual([]);
    home.clock.advanceTo(at(COMMAND_WAIT_MS));
    expect(logs.events().filter((event) => event === 'command.confirmed')).toHaveLength(2);
    expect(logs.events()).not.toContain('command.not_confirmed');
  });

  it('confirms a start by the station phase that comes before the robot leaves', async () => {
    const home = await rig();
    cleaning(home, 'docked', -SECOND);
    expectCleaning(home, 'start');
    cleaning(home, 'servicing', 2_000);
    expect(home.clock.pending()).toStrictEqual([]);
  });

  it('still warns when the command changed nothing the robot reports', async () => {
    const home = await rig();
    const logs = captureLogs();
    cleaning(home, 'cleaning', -SECOND);
    expectCleaning(home, 'pause');
    cleaning(home, 'cleaning', 500);
    home.clock.advanceTo(at(COMMAND_WAIT_MS));
    const missed = logs.records.filter((record) => record.event === 'command.not_confirmed');
    expect(missed).toHaveLength(1);
    expect(missed[0]?.payload).toMatchObject({ sent: 'pause', reported: 'cleaning' });
  });

  it('keeps confirming a movement that is its own reading by the same value', async () => {
    const home = await rig();
    cleaning(home, 'cleaning', -SECOND);
    expectCleaning(home, 'homing');
    cleaning(home, 'homing', 500);
    expect(home.clock.pending()).toStrictEqual([]);
  });
});

describe('long commands get their own budget', () => {
  it('gives a clip its length, a television wake its boot and report time and the rest the plain wait', () => {
    const clip = { deviceId: randomUUID(), seconds: 300 };
    expect(commandBudgetMs({ capability: 'hub:record_clip', value: clip, deviceKind: null })).toBe(
      315 * SECOND,
    );
    expect(commandBudgetMs({ capability: 'power', value: true, deviceKind: 'television' })).toBe(
      65 * SECOND,
    );
    expect(commandBudgetMs({ capability: 'ir_learn', value: null, deviceKind: 'remote' })).toBe(
      45 * SECOND,
    );
    expect(commandBudgetMs({ capability: 'power', value: true, deviceKind: 'light' })).toBe(
      COMMAND_WAIT_MS,
    );
  });

  it('lets an automation wait for a minute long clip instead of failing after the plain wait', async () => {
    let finish: (value: JsonValue) => void = () => undefined;
    const home = await setup(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const row = home.commands.add({
      capability: 'hub:record_clip',
      value: { deviceId: randomUUID(), seconds: 60 },
      source: 'automation',
    });
    const clock = new FakeClock(NOW.toISOString());
    let settled = false;
    const finishing = finishAutomationCommands(home.db.store, clock, home.executor, {
      rows: [row],
      admitted: false,
      authorize: () => undefined,
    }).finally(() => {
      settled = true;
    });
    await nextTurn();
    clock.advanceTo(at(COMMAND_WAIT_MS + SECOND));
    await nextTurn();
    expect(settled).toBe(false);
    finish({ clip: true });
    await expect(finishing).resolves.toBeUndefined();
  });
});

describe('the intended value ignores stale frames', () => {
  it('keeps the sent value against a frame inside the stale window and drops it after', () => {
    const now = { at: NOW };
    const intended = new IntendedValues(() => now.at);
    intended.record('lamp', {
      value: 40,
      sentAt: NOW.getTime(),
      expiresAt: Date.parse(at(60_000)),
    });
    expect(intended.value('lamp', at(SECOND))).toBe(40);
    expect(intended.value('lamp', at(2 * SECOND))).toBeUndefined();
  });
});
