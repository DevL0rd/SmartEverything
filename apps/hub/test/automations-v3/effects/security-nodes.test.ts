import { randomUUID } from 'node:crypto';
import { setImmediate as nextTurn } from 'node:timers/promises';
import type {
  DeviceCapability,
  DiscoveredDevice,
  JsonValue,
  RoomRow,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { withExecutionAuthority } from '../../../src/assistant/turn-authority';
import { DeviceSetter } from '../../../src/automations/effects/device-set';
import { securityEffects } from '../../../src/automations/effects/security-nodes';
import { CommandIssuer } from '../../../src/automations/issue-commands';
import { CommandExecutor } from '../../../src/commands/executor';
import type { ConversationAuthority } from '../../../src/harness/authority-contract';
import { DeviceDriverRegistry } from '../../../src/local/device-driver';
import { Inventory } from '../../../src/state/inventory';
import { testDatabase, type TestDatabase } from '../../support/database';
import { NOW } from '../../support/executor-setup';
import { FakeClock } from '../../support/fake-clock';
import { FakeAdapter, LAMP } from '../../support/fake-provider';
import { testLogger } from '../../support/logs';
import { testRun } from './support';

const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

function capability(
  key: DeviceCapability['key'],
  value: DeviceCapability['value'],
  access: DeviceCapability['access'] = 'read_write',
): DeviceCapability {
  return { key, label: key, access, value };
}

function device(
  name: string,
  kind: DiscoveredDevice['kind'],
  capabilities: readonly DeviceCapability[],
): DiscoveredDevice {
  return { ...LAMP, externalId: name, name, kind, room: 'Hall', capabilities: [...capabilities] };
}

const FRONT_DOOR = device('Front door', 'lock', [capability('lock', { kind: 'boolean' })]);
const BACK_DOOR = device('Back door', 'lock', [capability('lock', { kind: 'boolean' })]);
const STUCK_DOOR = device('Stuck door', 'lock', [capability('lock', { kind: 'boolean' }, 'read')]);
const PANEL = device('Panel', 'other', [
  capability('alarm', { kind: 'enum', options: ['disarmed', 'home', 'away'] }),
]);
const SIREN_ONLY = device('Siren', 'other', [capability('siren', { kind: 'boolean' })]);
const PERCENT_BLINDS = device('Percent blinds', 'cover', [
  capability('cover_position', { kind: 'number', min: 0, max: 100, step: 1, unit: '%' }),
  capability('cover_action', { kind: 'enum', options: ['open', 'close', 'stop'] }),
]);
const RAW_BLINDS = device('Raw blinds', 'cover', [
  capability('cover_position', { kind: 'number', min: 0, max: 200, step: 1 }),
  capability('cover_action', { kind: 'enum', options: ['open', 'close', 'stop'] }),
]);
const NO_STOP_BLINDS = device('Simple blinds', 'cover', [
  capability('cover_action', { kind: 'enum', options: ['open', 'close'] }),
]);

function authority(role: 'owner' | 'member', profileId: string): ConversationAuthority {
  return {
    event_id: randomUUID(),
    profile_id: profileId,
    client_id: null,
    kind: 'client',
    role,
    hub_os_ban: false,
    tools: null,
    plugin_id: null,
    requester: null,
  };
}

interface Rig {
  readonly db: TestDatabase;
  readonly room: RoomRow;
  readonly adapter: FakeAdapter;
  readonly clock: FakeClock;
  readonly ids: Readonly<Record<string, string>>;
  readonly owner: ConversationAuthority;
  readonly member: ConversationAuthority;
  readonly perform: (
    kind: 'lock.set' | 'alarm.set' | 'cover.set',
    params: EffectRequest['params'],
    options?: { readonly mode?: EffectRequest['mode']; readonly as?: ConversationAuthority },
  ) => Promise<NodeResult>;
}

function request(
  kind: string,
  params: EffectRequest['params'],
  mode?: EffectRequest['mode'],
): EffectRequest {
  return {
    kind,
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'idempotent',
    budget: 'command',
    ...(mode === undefined ? {} : { mode }),
  };
}

async function home(devices: readonly DiscoveredDevice[]): Promise<Rig> {
  const db = await testDatabase(NOW);
  open.push(db);
  const room = db.store.rooms.create('Hall', 0);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  await inventory.apply('xiaomi', [...devices]);
  const ids = Object.fromEntries(
    devices.map((each) => [each.name, inventory.deviceOf('xiaomi', each.externalId)?.id ?? '']),
  );
  const adapter = new FakeAdapter();
  const clock = new FakeClock(NOW.toISOString());
  const executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers: new DeviceDriverRegistry(),
    adapters: { adapterFor: (): FakeAdapter => adapter },
    hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
    log: testLogger(),
    now: clock.now,
  });
  const issuer = new CommandIssuer({ store: db.store, database: db.database, executor, clock });
  const setter = new DeviceSetter({ store: db.store, executor, issuer });
  const handlers = securityEffects({ setter });
  const perform: Rig['perform'] = (kind, params, options) => {
    const handler = handlers[kind];
    if (handler === undefined) throw new Error(`${kind} has no handler`);
    const run = (): Promise<NodeResult> =>
      Promise.resolve(handler(params, request(kind, params, options?.mode), testRun()));
    return options?.as === undefined ? run() : withExecutionAuthority(options.as, run);
  };
  return {
    db,
    room,
    adapter,
    clock,
    ids,
    owner: authority('owner', db.store.profiles.create({ name: 'Owner' }).id),
    member: authority('member', db.store.profiles.create({ name: 'Kid' }).id),
    perform,
  };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await nextTurn();
}

function report(db: TestDatabase, deviceId: string, capabilityKey: string, value: JsonValue): void {
  db.store.state.write([
    {
      deviceId,
      capability: capabilityKey,
      value,
      observedAt: new Date(NOW.getTime() + 100).toISOString(),
    },
  ]);
}

const OUTCOME = z.object({
  sent: z.array(z.object({ device: z.string() })),
  skipped: z.array(z.object({ device: z.object({ device: z.string() }), reason: z.string() })),
});

function outcomeOf(result: NodeResult): z.infer<typeof OUTCOME> {
  if (!result.ok) throw new Error(`the node failed: ${result.message}`);
  return OUTCOME.parse(result.value);
}

function sentTo(result: NodeResult): readonly string[] {
  return outcomeOf(result).sent.map((entry) => entry.device);
}

function executed(rig: Rig): readonly (readonly [string, JsonValue])[] {
  return rig.adapter.executed.map((command) => [command.capability, command.value] as const);
}

describe('lock.set', () => {
  it('locks and unlocks a lock, and locks by default', async () => {
    const rig = await home([FRONT_DOOR]);
    const target = { device: rig.ids['Front door'] ?? '' };
    expect(await rig.perform('lock.set', { target })).toMatchObject({ ok: true });
    expect(await rig.perform('lock.set', { target, locked: false })).toMatchObject({ ok: true });
    expect(executed(rig)).toStrictEqual([
      ['lock', true],
      ['lock', false],
    ]);
  });

  it('locks every lock of a room at once and skips devices that cannot lock', async () => {
    const rig = await home([FRONT_DOOR, BACK_DOOR, STUCK_DOOR, SIREN_ONLY]);
    const result = await rig.perform('lock.set', { target: { room: rig.room.id }, locked: true });
    expect(sentTo(result).toSorted()).toStrictEqual(
      [rig.ids['Front door'] ?? '', rig.ids['Back door'] ?? ''].toSorted(),
    );
    expect(outcomeOf(result).skipped).toHaveLength(2);
    expect(rig.adapter.executed).toHaveLength(2);
  });

  it('runs for the owner and for a run with no person behind it', async () => {
    const rig = await home([FRONT_DOOR]);
    const target = { device: rig.ids['Front door'] ?? '' };
    expect(await rig.perform('lock.set', { target }, { as: rig.owner })).toMatchObject({
      ok: true,
    });
    expect(await rig.perform('lock.set', { target })).toMatchObject({ ok: true });
    expect(rig.adapter.executed).toHaveLength(2);
  });

  it('is Forbidden for a member and sends nothing', async () => {
    const rig = await home([FRONT_DOOR]);
    const result = await rig.perform(
      'lock.set',
      { target: { device: rig.ids['Front door'] ?? '' }, locked: false },
      { as: rig.member },
    );
    expect(result).toMatchObject({ ok: false, class: 'Forbidden' });
    expect(rig.adapter.executed).toStrictEqual([]);
  });

  it('fails with Refused when no picked device is a lock', async () => {
    const rig = await home([SIREN_ONLY]);
    const result = await rig.perform('lock.set', {
      target: { device: rig.ids['Siren'] ?? '' },
    });
    expect(result).toMatchObject({ ok: false, class: 'Refused' });
  });

  it('is Invalid without a target', async () => {
    const rig = await home([FRONT_DOOR]);
    expect(await rig.perform('lock.set', { locked: true })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
  });
});

describe('alarm.set', () => {
  it('sends the chosen mode to the panel', async () => {
    const rig = await home([PANEL]);
    const result = await rig.perform('alarm.set', {
      target: { device: rig.ids['Panel'] ?? '' },
      mode: 'away',
    });
    expect(sentTo(result)).toStrictEqual([rig.ids['Panel']]);
    expect(executed(rig)).toStrictEqual([['alarm', 'away']]);
  });

  it('refuses a mode the panel does not offer and lists what it offers', async () => {
    const rig = await home([PANEL]);
    const result = await rig.perform('alarm.set', {
      target: { device: rig.ids['Panel'] ?? '' },
      mode: 'night',
    });
    expect(result).toMatchObject({ ok: false, class: 'Refused' });
    expect(result.ok ? '' : result.message).toContain('disarmed, home, away');
    expect(rig.adapter.executed).toStrictEqual([]);
  });

  it('lets a member arm the alarm and skips devices without an alarm', async () => {
    const rig = await home([PANEL, SIREN_ONLY]);
    const result = await rig.perform(
      'alarm.set',
      { target: { room: rig.room.id }, mode: 'home' },
      { as: rig.member },
    );
    expect(sentTo(result)).toStrictEqual([rig.ids['Panel']]);
    expect(outcomeOf(result).skipped).toHaveLength(1);
  });

  it('is Invalid without a mode', async () => {
    const rig = await home([PANEL]);
    expect(
      await rig.perform('alarm.set', { target: { device: rig.ids['Panel'] ?? '' } }),
    ).toMatchObject({ ok: false, class: 'Invalid' });
  });
});

describe('cover.set', () => {
  it('opens by default and closes or stops on request', async () => {
    const rig = await home([PERCENT_BLINDS]);
    const target = { device: rig.ids['Percent blinds'] ?? '' };
    await rig.perform('cover.set', { target });
    await rig.perform('cover.set', { target, action: 'close' });
    await rig.perform('cover.set', { target, action: 'stop' });
    expect(executed(rig)).toStrictEqual([
      ['cover_action', 'open'],
      ['cover_action', 'close'],
      ['cover_action', 'stop'],
    ]);
  });

  it('moves to a percentage of each blind own range', async () => {
    const rig = await home([PERCENT_BLINDS, RAW_BLINDS]);
    const result = await rig.perform('cover.set', {
      target: { devices: [rig.ids['Percent blinds'] ?? '', rig.ids['Raw blinds'] ?? ''] },
      action: 'position',
      position: 50,
    });
    expect(sentTo(result)).toHaveLength(2);
    expect(
      executed(rig).toSorted((left, right) => Number(left[1]) - Number(right[1])),
    ).toStrictEqual([
      ['cover_position', 50],
      ['cover_position', 100],
    ]);
  });

  it('can close a whole room at once and skips blinds that lack the action', async () => {
    const rig = await home([PERCENT_BLINDS, NO_STOP_BLINDS]);
    const closed = await rig.perform('cover.set', {
      target: { room: rig.room.id },
      action: 'close',
    });
    expect(sentTo(closed)).toHaveLength(2);
    const stopped = await rig.perform('cover.set', {
      target: { room: rig.room.id },
      action: 'stop',
    });
    expect(sentTo(stopped)).toStrictEqual([rig.ids['Percent blinds']]);
    expect(outcomeOf(stopped).skipped).toHaveLength(1);
  });

  it('asks for a position when the action is to go to one and rejects a position outside 0 to 100', async () => {
    const rig = await home([PERCENT_BLINDS]);
    const target = { device: rig.ids['Percent blinds'] ?? '' };
    expect(await rig.perform('cover.set', { target, action: 'position' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(
      await rig.perform('cover.set', { target, action: 'position', position: 120 }),
    ).toMatchObject({ ok: false, class: 'Invalid' });
    expect(rig.adapter.executed).toStrictEqual([]);
  });
});

describe('run mode', () => {
  it('continues as soon as the command is handed over when it only sends', async () => {
    const rig = await home([PANEL]);
    const result = await rig.perform('alarm.set', {
      target: { device: rig.ids['Panel'] ?? '' },
      mode: 'away',
    });
    expect(result).toMatchObject({ ok: true });
    expect(rig.adapter.executed).toHaveLength(1);
  });

  it('finishes when the device reports the value and times out when it does not', async () => {
    const rig = await home([FRONT_DOOR]);
    const id = rig.ids['Front door'] ?? '';
    let finished = false;
    const result = rig
      .perform('lock.set', { target: { device: id }, locked: true }, { mode: 'wait_for_result' })
      .finally(() => {
        finished = true;
      });
    await settle();
    expect(finished).toBe(false);
    report(rig.db, id, 'lock', true);
    expect(await result).toMatchObject({ ok: true });

    const stuck = rig.perform(
      'lock.set',
      { target: { device: id }, locked: false },
      { mode: 'wait_for_result' },
    );
    await settle();
    rig.clock.advanceTo(new Date(NOW.getTime() + 60_000).toISOString());
    expect(await stuck).toMatchObject({ ok: false, class: 'Timeout' });
  });
});
