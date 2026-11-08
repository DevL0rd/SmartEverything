import { randomUUID } from 'node:crypto';
import { setImmediate as nextTurn } from 'node:timers/promises';
import type { CommandRow, DeviceCommand, JsonValue } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { HubTool, HubToolResult } from '../src/ai-tools/hub-tool';
import type { ToolCheck } from '../src/ai-tools/tool-hub';
import { DeviceRestorer } from '../src/automations/effects/device-restore';
import { DeviceSetter } from '../src/automations/effects/device-set';
import { TemporaryDeviceChanges } from '../src/automations/effects/device-temporary';
import { Notifier } from '../src/automations/effects/notify';
import { CommandIssuer } from '../src/automations/issue-commands';
import { DeviceEffects } from '../src/commands/effects';
import { CommandExecutor } from '../src/commands/executor';
import { DeviceDriverRegistry } from '../src/local/device-driver';
import { Inventory } from '../src/state/inventory';
import { testDatabase, type TestDatabase } from './support/database';
import { NOW } from './support/executor-setup';
import { FakeClock } from './support/fake-clock';
import { LAMP } from './support/fake-provider';
import { testLogger } from './support/logs';
import { testRun } from './automations-v3/effects/support';

const LAMPS = 3;
const STAMP = { nodePath: 'node', iteration: 0, attempt: 1 };
const DEVICE_TARGET = z.object({ deviceId: z.string() });
const SPEAK_TOOL: HubTool = {
  name: 'voice_speak',
  title: 'Speak',
  description: 'Speak',
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  origin: { kind: 'se' },
  humanOnly: false,
};
const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

class Trips {
  readonly order: string[] = [];
  peak = 0;
  private busy = 0;
  private readonly busyOf = new Map<string, number>();
  readonly peakOf = new Map<string, number>();

  async trip(label: string, value = label): Promise<void> {
    this.order.push(label);
    this.busy += 1;
    this.peak = Math.max(this.peak, this.busy);
    const busy = (this.busyOf.get(value) ?? 0) + 1;
    this.busyOf.set(value, busy);
    this.peakOf.set(value, Math.max(this.peakOf.get(value) ?? 0, busy));
    await nextTurn();
    this.busy -= 1;
    this.busyOf.set(value, (this.busyOf.get(value) ?? 1) - 1);
  }
}

interface Rig {
  readonly db: TestDatabase;
  readonly executor: CommandExecutor;
  readonly lamps: readonly string[];
  readonly trips: Trips;
  readonly clock: FakeClock;
}

async function roundTrip(trips: Trips, command: DeviceCommand): Promise<JsonValue> {
  await trips.trip(command.capability, JSON.stringify(command.value));
  return null;
}

async function rig(): Promise<Rig> {
  const db = await testDatabase(NOW);
  open.push(db);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  await inventory.apply(
    'local',
    Array.from({ length: LAMPS }, (_, index) => ({
      ...LAMP,
      provider: 'local' as const,
      externalId: `slow:lamp-${String(index)}`,
      name: `Lamp ${String(index)}`,
    })),
  );
  const trips = new Trips();
  const drivers = new DeviceDriverRegistry();
  drivers.register({
    id: 'slow',
    start: (): Promise<() => Promise<void>> => Promise.resolve(() => Promise.resolve()),
    execute: (command): Promise<JsonValue> => roundTrip(trips, command),
  });
  const executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers,
    adapters: { adapterFor: (): undefined => undefined },
    hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
    log: testLogger(),
    now: (): Date => NOW,
  });
  const lamps = Array.from(
    { length: LAMPS },
    (_, index) => inventory.deviceOf('local', `slow:lamp-${String(index)}`)?.id ?? '',
  );
  return { db, executor, lamps, trips, clock: new FakeClock(NOW.toISOString()) };
}

function setterOf(home: Rig): DeviceSetter {
  const issuer = new CommandIssuer({
    store: home.db.store,
    database: home.db.database,
    executor: home.executor,
    clock: home.clock,
  });
  return new DeviceSetter({ store: home.db.store, executor: home.executor, issuer });
}

function lampRows(home: Rig): readonly CommandRow[] {
  const deviceId = home.lamps[0] ?? '';
  return home.db.store.commands.insert([
    { deviceId, capability: 'brightness', value: 30, source: 'automation', requestedBy: null },
    { deviceId, capability: 'brightness', value: 40, source: 'automation', requestedBy: null },
    { deviceId, capability: 'power', value: true, source: 'automation', requestedBy: null },
  ]);
}

describe('the generic command layer waits only where an order is needed', () => {
  it('sends the controls of one device together on a driver that cannot batch, with the last one after them', async () => {
    const home = await rig();
    const rows = lampRows(home);
    await home.executor.runTogether(rows);
    expect(home.trips.peak).toBe(rows.length - 1);
    expect(home.trips.order.at(-1)).toBe('power');
    for (const row of rows) expect(home.db.store.commands.byId(row.id).status).toBe('succeeded');
  });

  it('restores every remembered device at once instead of one after the other', async () => {
    const home = await rig();
    const snapshot = Object.fromEntries(
      home.lamps.map((lamp) => [lamp, { power: true, brightness: 30 }]),
    );
    const result = await new DeviceRestorer(setterOf(home)).restore(snapshot, STAMP, testRun());
    expect(result.sent).toHaveLength(LAMPS);
    expect(home.trips.peakOf.get('30')).toBe(LAMPS);
  });

  it('starts a temporary change on every member at once', async () => {
    const home = await rig();
    home.db.store.state.write(
      home.lamps.map((deviceId) => ({
        deviceId,
        capability: 'brightness',
        value: 60,
        observedAt: NOW.toISOString(),
      })),
    );
    const effects = new DeviceEffects(home.db.store, testLogger());
    effects.attach(home.executor);
    const changes = new TemporaryDeviceChanges(home.db.store, home.clock, effects);
    await changes.run(
      {
        target: { kind: 'devices', deviceIds: [...home.lamps] },
        control: 'brightness',
        operation: { type: 'set', value: 20 },
        durationMs: 0,
        priority: 0,
        holds: () => true,
        clockMinutes: [],
        nodeId: randomUUID(),
      },
      testRun(),
    );
    await effects.stop();
    expect(home.trips.peakOf.get('20')).toBe(LAMPS);
  });

  it('speaks on every target at once and names them in target order', async () => {
    const speaking = new Trips();
    const notifier = new Notifier({
      events: { record: (): void => undefined },
      clock: new FakeClock(NOW.toISOString()),
      tools: {
        check: (): ToolCheck => ({ ok: true, tool: SPEAK_TOOL }),
        call: async (_name, args): Promise<HubToolResult> => {
          const label = DEVICE_TARGET.parse(args['target']).deviceId;
          await speaking.trip(label);
          return {
            response: { result: { result: { target_label: label } } },
            line: '',
            pictures: [],
          };
        },
      },
    });
    const targets = ['a', 'b', 'c'].map((deviceId) => ({ kind: 'device' as const, deviceId }));
    const spoken = await notifier.speakAll(
      { targets, text: 'Dinner is ready', priority: 'queue', asProfileId: NOW.toISOString() },
      { plugin: null },
    );
    expect(spoken).toStrictEqual({ ok: true, spokenOn: ['a', 'b', 'c'] });
    expect(speaking.peak).toBe(targets.length);
  });
});
