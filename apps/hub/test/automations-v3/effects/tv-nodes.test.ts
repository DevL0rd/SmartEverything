import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  NODE_REGISTRY,
  type DeviceCapability,
  type DiscoveredDevice,
  type JsonValue,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it } from 'vitest';
import { DeviceSetter } from '../../../src/automations/effects/device-set';
import { tvEffects } from '../../../src/automations/effects/tv-nodes';
import { CommandIssuer } from '../../../src/automations/issue-commands';
import { CommandExecutor } from '../../../src/commands/executor';
import { WAKE_DEADLINE_MS } from '../../../src/commands/television-wake';
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

const POWER = capability('power', { kind: 'boolean' });
const VOLUME = capability('volume', { kind: 'number', min: 0, max: 100, step: 1, unit: '%' });
const MUTE = capability('mute', { kind: 'boolean' });
const INPUT = capability('input_source', { kind: 'enum', options: ['HDMI1', 'HDMI2', 'dtv'] });
const CHANNEL = capability('channel', { kind: 'number', min: 1, max: 999, step: 1 });
const APP = capability('app_launch', { kind: 'enum', options: ['Netflix', 'YouTube'] }, 'write');
const REMOTE = capability(
  'remote_key',
  { kind: 'enum', options: ['home', 'back', 'vol_up', 'vol_down'] },
  'write',
);
const ART = capability('art_mode', { kind: 'boolean' });
const PLAYBACK = capability('playback', {
  kind: 'enum',
  options: ['playing', 'paused', 'stopped', 'fast forwarding', 'rewinding'],
});
const PICTURE = capability('raw:custom.picturemode.picture_mode', {
  kind: 'enum',
  options: ['Standard', 'Movie'],
});
const SOUND = capability('raw:custom.soundmode.sound_mode', {
  kind: 'enum',
  options: ['Standard', 'Adaptive'],
});

function television(
  name: string,
  capabilities: readonly DeviceCapability[],
  kind: DiscoveredDevice['kind'] = 'television',
): DiscoveredDevice {
  return { ...LAMP, externalId: name, name, kind, capabilities: [...capabilities] };
}

const FULL = [POWER, VOLUME, MUTE, INPUT, CHANNEL, APP, REMOTE, ART, PLAYBACK, PICTURE, SOUND];

interface Rig {
  readonly db: TestDatabase;
  readonly adapter: FakeAdapter;
  readonly clock: FakeClock;
  readonly ids: Readonly<Record<string, string>>;
  readonly run: (
    params: EffectRequest['params'],
    mode?: EffectRequest['mode'],
  ) => Promise<NodeResult>;
}

function request(params: EffectRequest['params'], mode?: EffectRequest['mode']): EffectRequest {
  return {
    kind: 'tv.control',
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'relative',
    budget: 'command',
    ...(mode === undefined ? {} : { mode }),
  };
}

async function home(devices: readonly DiscoveredDevice[]): Promise<Rig> {
  const db = await testDatabase(NOW);
  open.push(db);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  await inventory.apply('xiaomi', [...devices]);
  const ids = Object.fromEntries(
    devices.map((device) => [
      device.name,
      inventory.deviceOf('xiaomi', device.externalId)?.id ?? '',
    ]),
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
  const handler = tvEffects({ store: db.store, setter })['tv.control'];
  if (handler === undefined) throw new Error('tv.control has no handler');
  return {
    db,
    adapter,
    clock,
    ids,
    run: (params, mode) => handler(params, request(params, mode), testRun()),
  };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await nextTurn();
}

function report(db: TestDatabase, deviceId: string, key: string, value: JsonValue): void {
  db.store.state.write([
    {
      deviceId,
      capability: key,
      value,
      observedAt: new Date(NOW.getTime() + 100).toISOString(),
    },
  ]);
}

function sent(adapter: FakeAdapter): readonly (readonly [string, JsonValue])[] {
  return adapter.executed.map((command) => [command.capability, command.value]);
}

describe('tv.control sends the control each action stands for', () => {
  it('turns the TV on and off, mutes and unmutes, and switches art mode', async () => {
    const rig = await home([television('TV', FULL)]);
    const tv = { device: rig.ids['TV'] ?? '' };
    for (const action of ['power_on', 'power_off', 'mute', 'unmute', 'art_mode_on', 'art_mode_off'])
      expect(await rig.run({ tv, action }), action).toMatchObject({ ok: true });
    expect(sent(rig.adapter)).toStrictEqual([
      ['power', true],
      ['power', false],
      ['mute', true],
      ['mute', false],
      ['art_mode', true],
      ['art_mode', false],
    ]);
  });

  it('steps the volume with the remote buttons and sets it to a number', async () => {
    const rig = await home([television('TV', FULL)]);
    const tv = { device: rig.ids['TV'] ?? '' };
    await rig.run({ tv, action: 'volume_up' });
    await rig.run({ tv, action: 'volume_down' });
    await rig.run({ tv, action: 'volume_set', volume: 25 });
    expect(sent(rig.adapter)).toStrictEqual([
      ['remote_key', 'vol_up'],
      ['remote_key', 'vol_down'],
      ['volume', 25],
    ]);
  });

  it('switches input, channel, app and remote button from the picked values', async () => {
    const rig = await home([television('TV', FULL)]);
    const tv = { device: rig.ids['TV'] ?? '' };
    await rig.run({ tv, action: 'input', input: 'HDMI2' });
    await rig.run({ tv, action: 'channel', channel: 7 });
    await rig.run({ tv, action: 'open_app', app: 'Netflix' });
    await rig.run({ tv, action: 'press_key', key: 'home' });
    expect(sent(rig.adapter)).toStrictEqual([
      ['input_source', 'HDMI2'],
      ['channel', 7],
      ['app_launch', 'Netflix'],
      ['remote_key', 'home'],
    ]);
  });

  it('maps playback choices to the statuses the TV reports', async () => {
    const rig = await home([television('TV', FULL)]);
    const tv = { device: rig.ids['TV'] ?? '' };
    await rig.run({ tv, action: 'playback', playback: 'pause' });
    await rig.run({ tv, action: 'playback', playback: 'play' });
    await rig.run({ tv, action: 'playback', playback: 'stop' });
    expect(sent(rig.adapter)).toStrictEqual([
      ['playback', 'paused'],
      ['playback', 'playing'],
      ['playback', 'stopped'],
    ]);
  });

  it('changes picture and sound mode through their roles', async () => {
    const rig = await home([television('TV', FULL)]);
    const tv = { device: rig.ids['TV'] ?? '' };
    expect(await rig.run({ tv, action: 'picture_mode', pictureMode: 'Movie' })).toMatchObject({
      ok: true,
    });
    expect(await rig.run({ tv, action: 'sound_mode', soundMode: 'Adaptive' })).toMatchObject({
      ok: true,
    });
    expect(sent(rig.adapter)).toStrictEqual([
      ['raw:custom.picturemode.picture_mode', 'Movie'],
      ['raw:custom.soundmode.sound_mode', 'Adaptive'],
    ]);
  });

  it('accepts every action and playback choice the node declares', async () => {
    const kind = NODE_REGISTRY.get('tv.control');
    const choices = (name: string): readonly string[] => {
      const port = kind?.inputs.find((each) => each.name === name);
      return port?.type.t === 'choice' ? port.type.options.map((option) => option.id) : [];
    };
    const rig = await home([television('TV', FULL)]);
    const tv = { device: rig.ids['TV'] ?? '' };
    const values = {
      volume: 10,
      input: 'HDMI1',
      channel: 3,
      app: 'YouTube',
      key: 'back',
      playback: 'play',
      pictureMode: 'Standard',
      soundMode: 'Standard',
    };
    expect(choices('action')).toHaveLength(16);
    for (const action of choices('action'))
      expect(await rig.run({ tv, action, ...values }), action).toMatchObject({ ok: true });
    for (const playback of choices('playback'))
      expect(await rig.run({ tv, action: 'playback', playback }), playback).toMatchObject({
        ok: true,
      });
  });
});

describe('tv.control refuses what cannot be done and sends nothing', () => {
  it('is Invalid when the value an action needs is missing', async () => {
    const rig = await home([television('TV', FULL)]);
    const tv = { device: rig.ids['TV'] ?? '' };
    for (const action of [
      'volume_set',
      'input',
      'channel',
      'open_app',
      'press_key',
      'playback',
      'picture_mode',
      'sound_mode',
    ])
      expect(await rig.run({ tv, action }), action).toMatchObject({ ok: false, class: 'Invalid' });
    expect(await rig.run({ tv })).toMatchObject({ ok: false, class: 'Invalid' });
    expect(rig.adapter.executed).toStrictEqual([]);
  });

  it('refuses a volume outside the TV range and an input it does not offer, without clamping', async () => {
    const rig = await home([television('TV', FULL)]);
    const tv = { device: rig.ids['TV'] ?? '' };
    expect(await rig.run({ tv, action: 'volume_set', volume: 150 })).toMatchObject({
      ok: false,
      class: 'Refused',
    });
    expect(await rig.run({ tv, action: 'input', input: 'HDMI9' })).toMatchObject({
      ok: false,
      class: 'Refused',
    });
    expect(rig.adapter.executed).toStrictEqual([]);
  });

  it('is Invalid for a device that is not a TV and Refused for a TV without the control', async () => {
    const rig = await home([
      television('Lamp', [POWER], 'light'),
      television('Plain TV', [POWER, VOLUME]),
    ]);
    const notTv = await rig.run({ tv: { device: rig.ids['Lamp'] ?? '' }, action: 'power_on' });
    expect(notTv).toMatchObject({ ok: false, class: 'Invalid' });
    expect(notTv.ok ? '' : notTv.message).toContain('not a TV');
    const noArt = await rig.run({
      tv: { device: rig.ids['Plain TV'] ?? '' },
      action: 'art_mode_on',
    });
    expect(noArt).toMatchObject({ ok: false, class: 'Refused' });
    expect(rig.adapter.executed).toStrictEqual([]);
  });

  it('turns an adapter failure into a failed result for the error exit', async () => {
    const rig = await home([television('TV', FULL)]);
    rig.adapter.failure = new Error('the TV did not answer');
    const result = await rig.run(
      { tv: { device: rig.ids['TV'] ?? '' }, action: 'mute' },
      'wait_for_result',
    );
    expect(result.ok).toBe(false);
  });
});

describe('tv.control run modes', () => {
  it('continues once the command is handed over without waiting for the TV to report', async () => {
    const rig = await home([television('TV', FULL)]);
    const result = await rig.run({ tv: { device: rig.ids['TV'] ?? '' }, action: 'power_on' });
    expect(result).toMatchObject({ ok: true });
    expect(rig.adapter.executed).toHaveLength(1);
  });

  it('waits for the TV to report the new volume and times out on the normal budget', async () => {
    const rig = await home([television('TV', FULL)]);
    const id = rig.ids['TV'] ?? '';
    let finished = false;
    const result = rig
      .run({ tv: { device: id }, action: 'volume_set', volume: 30 }, 'wait_for_result')
      .finally(() => {
        finished = true;
      });
    await settle();
    expect(finished).toBe(false);
    report(rig.db, id, 'volume', 30);
    expect(await result).toMatchObject({ ok: true });

    const stuck = rig.run(
      { tv: { device: id }, action: 'volume_set', volume: 40 },
      'wait_for_result',
    );
    await settle();
    rig.clock.advanceTo(new Date(NOW.getTime() + 21_000).toISOString());
    expect(await stuck).toMatchObject({ ok: false, class: 'Timeout' });
  });

  it('gives turning the TV on the longer wake budget before it times out', async () => {
    const rig = await home([television('TV', FULL)]);
    const id = rig.ids['TV'] ?? '';
    let outcome: NodeResult | undefined;
    const result = rig
      .run({ tv: { device: id }, action: 'power_on' }, 'wait_for_result')
      .then((done) => {
        outcome = done;
        return done;
      });
    await settle();
    rig.clock.advanceTo(new Date(NOW.getTime() + 30_000).toISOString());
    await settle();
    expect(outcome).toBeUndefined();
    rig.clock.advanceTo(new Date(NOW.getTime() + WAKE_DEADLINE_MS + 6_000).toISOString());
    expect(await result).toMatchObject({ ok: false, class: 'Timeout' });
  });

  it('confirms turning the TV on when it reports power on within the wake budget', async () => {
    const rig = await home([television('TV', FULL)]);
    const id = rig.ids['TV'] ?? '';
    const result = rig.run({ tv: { device: id }, action: 'power_on' }, 'wait_for_result');
    await settle();
    rig.clock.advanceTo(new Date(NOW.getTime() + 30_000).toISOString());
    report(rig.db, id, 'power', true);
    expect(await result).toMatchObject({ ok: true });
  });
});
