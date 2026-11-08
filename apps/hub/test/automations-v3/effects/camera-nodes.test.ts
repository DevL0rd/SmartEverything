import { setImmediate as nextTurn } from 'node:timers/promises';
import type {
  DeviceCapability,
  DeviceCommand,
  DiscoveredDevice,
  JsonValue,
  RoomRow,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { cameraEffects } from '../../../src/automations/effects/camera-nodes';
import { DeviceSetter } from '../../../src/automations/effects/device-set';
import { CommandIssuer } from '../../../src/automations/issue-commands';
import { CommandExecutor } from '../../../src/commands/executor';
import { DeviceDriverRegistry } from '../../../src/local/device-driver';
import { Inventory } from '../../../src/state/inventory';
import { testDatabase, type TestDatabase } from '../../support/database';
import { NOW } from '../../support/executor-setup';
import { FakeClock } from '../../support/fake-clock';
import { CAMERA, FakeAdapter, LAMP } from '../../support/fake-provider';
import { testLogger } from '../../support/logs';
import { testRun } from './support';

const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

class TogetherAdapter extends FakeAdapter {
  readonly together: DeviceCommand[][] = [];
  gate: Promise<void> | null = null;

  executeTogether = async (commands: readonly DeviceCommand[]): Promise<JsonValue> => {
    this.together.push([...commands]);
    if (this.gate !== null) await this.gate;
    return null;
  };

  close(): () => void {
    let release: () => void = () => undefined;
    this.gate = new Promise((resolve) => {
      release = resolve;
    });
    return () => {
      this.gate = null;
      release();
    };
  }
}

function batches(adapter: TogetherAdapter): readonly (readonly DeviceCommand[])[] {
  return [...adapter.together, ...adapter.executed.map((command) => [command])];
}

function capability(
  key: DeviceCapability['key'],
  value: DeviceCapability['value'],
  access: DeviceCapability['access'] = 'read_write',
): DeviceCapability {
  return { key, label: key, access, value };
}

const PRIVACY = capability('privacy_mode', { kind: 'boolean' });
const MOTION = capability('motion_detection', { kind: 'boolean' });
const LIGHT = capability('status_light', { kind: 'boolean' });
const NIGHT = capability('night_vision', { kind: 'enum', options: ['off', 'on', 'auto'] });
const TURN = capability('ptz', { kind: 'action', arguments: ['direction'] });
const POSITIONS = capability('ptz_preset', { kind: 'enum', options: ['Door', 'Garden'] });

function cameraDevice(
  name: string,
  capabilities: readonly DeviceCapability[],
  extra: Partial<DiscoveredDevice> = {},
): DiscoveredDevice {
  return {
    ...CAMERA,
    externalId: name,
    parentExternalId: null,
    name,
    room: 'Hall',
    capabilities: [...capabilities],
    ...extra,
  };
}

const FRONT = cameraDevice('Front door', [PRIVACY, MOTION, NIGHT, LIGHT, TURN, POSITIONS]);
const YARD = cameraDevice('Yard', [PRIVACY, MOTION, NIGHT, LIGHT]);
const STILL = cameraDevice('Still', [PRIVACY, MOTION]);
const UNPLUGGED = cameraDevice('Unplugged', [PRIVACY, MOTION], { online: false });
const BELL = cameraDevice('Bell', [capability('power', { kind: 'boolean' }), MOTION], {
  kind: 'doorbell',
});
const READ_ONLY = cameraDevice('Reader', [
  capability('privacy_mode', { kind: 'boolean' }, 'read'),
  capability('motion_detection', { kind: 'boolean' }, 'read'),
]);
const HALL_LAMP: DiscoveredDevice = {
  ...LAMP,
  externalId: 'Hall lamp',
  name: 'Hall lamp',
  room: 'Hall',
};

interface Rig {
  readonly db: TestDatabase;
  readonly room: RoomRow;
  readonly adapter: TogetherAdapter;
  readonly clock: FakeClock;
  readonly ids: Readonly<Record<string, string>>;
  readonly move: (
    params: EffectRequest['params'],
    mode?: EffectRequest['mode'],
  ) => Promise<NodeResult>;
  readonly set: (
    params: EffectRequest['params'],
    mode?: EffectRequest['mode'],
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
    devices.map((device) => [
      device.name,
      inventory.deviceOf('xiaomi', device.externalId)?.id ?? '',
    ]),
  );
  const adapter = new TogetherAdapter();
  const clock = new FakeClock(NOW.toISOString());
  const executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers: new DeviceDriverRegistry(),
    adapters: { adapterFor: (): TogetherAdapter => adapter },
    hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
    log: testLogger(),
    now: clock.now,
  });
  const issuer = new CommandIssuer({ store: db.store, database: db.database, executor, clock });
  const setter = new DeviceSetter({ store: db.store, executor, issuer });
  const handlers = cameraEffects({ store: db.store, setter });
  const perform =
    (kind: string): Rig['move'] =>
    (params, mode) => {
      const handler = handlers[kind];
      if (handler === undefined) throw new Error(`${kind} has no handler`);
      return handler(params, request(kind, params, mode), testRun());
    };
  return {
    db,
    room,
    adapter,
    clock,
    ids,
    move: perform('camera.move'),
    set: perform('camera.set'),
  };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await nextTurn();
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

function skippedReasons(result: NodeResult): readonly string[] {
  return outcomeOf(result).skipped.map((entry) => entry.reason);
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

function valuesOf(commands: readonly DeviceCommand[]): Record<string, JsonValue> {
  return Object.fromEntries(commands.map((command) => [command.capability, command.value]));
}

function failureOf(result: NodeResult): string {
  return result.ok ? '' : result.message;
}

describe('camera.move turns a camera by direction and steps', () => {
  it('sends one turn command per step, in order, each with the direction', async () => {
    const rig = await home([FRONT]);
    const result = await rig.move({
      camera: rig.ids['Front door'] ?? '',
      direction: 'left',
      steps: 3,
    });
    expect(result).toMatchObject({ ok: true });
    const turns = rig.adapter.executed.filter((command) => command.capability === 'ptz');
    expect(turns).toHaveLength(3);
    for (const turn of turns) expect(turn.value).toStrictEqual({ direction: 'left' });
  });

  it('turns once when steps are left out and takes a camera reference object', async () => {
    const rig = await home([FRONT]);
    const result = await rig.move({
      camera: { camera: rig.ids['Front door'] ?? '' },
      direction: 'up',
    });
    expect(result).toMatchObject({ ok: true });
    expect(rig.adapter.executed.map((command) => command.value)).toStrictEqual([
      { direction: 'up' },
    ]);
  });

  it('does not cap the number of steps', async () => {
    const rig = await home([FRONT]);
    const result = await rig.move({
      camera: rig.ids['Front door'] ?? '',
      direction: 'down',
      steps: 150,
    });
    expect(result).toMatchObject({ ok: true });
    expect(rig.adapter.executed).toHaveLength(150);
  });

  it('continues after the commands are handed over in send mode and when waiting', async () => {
    const rig = await home([FRONT]);
    const id = rig.ids['Front door'] ?? '';
    expect(await rig.move({ camera: id, direction: 'right' }, 'fire_and_forget')).toMatchObject({
      ok: true,
    });
    expect(await rig.move({ camera: id, direction: 'right' }, 'wait_for_result')).toMatchObject({
      ok: true,
    });
    expect(rig.adapter.executed).toHaveLength(2);
  });
});

describe('camera.move turns to a saved position', () => {
  it('sends the chosen saved position as one command', async () => {
    const rig = await home([FRONT]);
    const result = await rig.move({ camera: rig.ids['Front door'] ?? '', preset: 'Garden' });
    expect(result).toMatchObject({ ok: true });
    expect(
      rig.adapter.executed.map((command) => [command.capability, command.value]),
    ).toStrictEqual([['ptz_preset', 'Garden']]);
  });

  it('refuses a saved position the camera does not have and sends nothing', async () => {
    const rig = await home([FRONT]);
    const result = await rig.move({ camera: rig.ids['Front door'] ?? '', preset: 'Roof' });
    expect(result).toMatchObject({ ok: false, class: 'Refused' });
    expect(rig.adapter.executed).toStrictEqual([]);
  });
});

describe('camera.move refuses what it cannot do', () => {
  it('is Invalid with both or neither of a saved position and a direction', async () => {
    const rig = await home([FRONT]);
    const camera = rig.ids['Front door'] ?? '';
    expect(await rig.move({ camera })).toMatchObject({ ok: false, class: 'Invalid' });
    expect(await rig.move({ camera, preset: 'Door', direction: 'left' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(rig.adapter.executed).toStrictEqual([]);
  });

  it('is Refused for a camera that cannot turn or has no saved positions', async () => {
    const rig = await home([STILL]);
    const camera = rig.ids['Still'] ?? '';
    const turned = await rig.move({ camera, direction: 'left' });
    expect(turned).toMatchObject({ ok: false, class: 'Refused' });
    expect(failureOf(turned)).toContain('cannot be turned');
    const placed = await rig.move({ camera, preset: 'Door' });
    expect(placed).toMatchObject({ ok: false, class: 'Refused' });
    expect(failureOf(placed)).toContain('no saved positions');
  });

  it('is Invalid for a device that is not a camera and NotFound for an unknown one', async () => {
    const rig = await home([FRONT, HALL_LAMP]);
    expect(await rig.move({ camera: rig.ids['Hall lamp'] ?? '', direction: 'left' })).toMatchObject(
      {
        ok: false,
        class: 'Invalid',
      },
    );
    expect(await rig.move({ camera: 'missing', direction: 'left' })).toMatchObject({
      ok: false,
      class: 'NotFound',
    });
  });

  it('is Refused for an offline camera', async () => {
    const rig = await home([cameraDevice('Away', [TURN], { online: false })]);
    const result = await rig.move({ camera: rig.ids['Away'] ?? '', direction: 'left' });
    expect(result).toMatchObject({ ok: false, class: 'Refused' });
    expect(rig.adapter.executed).toStrictEqual([]);
  });
});

describe('camera.set sends one command per camera, all cameras at once', () => {
  it('puts every setting of a camera in one command and starts all cameras before any finishes', async () => {
    const rig = await home([FRONT, YARD]);
    const release = rig.adapter.close();
    const result = rig.set({
      target: { devices: [rig.ids['Front door'] ?? '', rig.ids['Yard'] ?? ''] },
      privacy: 'off',
      motionDetection: 'on',
      nightVision: 'auto',
      statusLight: 'off',
    });
    await settle();
    expect(batches(rig.adapter)).toHaveLength(2);
    expect(rig.adapter.executed).toStrictEqual([]);
    for (const commands of batches(rig.adapter)) {
      expect(valuesOf(commands)).toStrictEqual({
        privacy_mode: false,
        motion_detection: true,
        night_vision: 'auto',
        status_light: false,
      });
    }
    release();
    const done = await result;
    expect(done).toMatchObject({ ok: true });
    expect(sentTo(done)).toHaveLength(2);
    expect(skippedReasons(done)).toStrictEqual([]);
  });

  it('leaves settings alone that are not asked for', async () => {
    const rig = await home([FRONT]);
    const result = await rig.set({
      target: { device: rig.ids['Front door'] ?? '' },
      privacy: 'on',
    });
    expect(result).toMatchObject({ ok: true });
    expect(batches(rig.adapter).map(valuesOf)).toStrictEqual([{ privacy_mode: true }]);
  });

  it('continues once the command is handed over without waiting for a state report', async () => {
    const rig = await home([FRONT]);
    const result = await rig.set({
      target: { device: rig.ids['Front door'] ?? '' },
      motionDetection: 'off',
    });
    expect(result).toMatchObject({ ok: true });
    expect(batches(rig.adapter)).toHaveLength(1);
  });
});

describe('camera.set waits for the cameras when the node waits for the result', () => {
  it('finishes when every camera reports the value and times out when one does not', async () => {
    const rig = await home([FRONT, YARD]);
    const first = rig.ids['Front door'] ?? '';
    const second = rig.ids['Yard'] ?? '';
    let finished = false;
    const result = rig
      .set({ target: { devices: [first, second] }, motionDetection: 'on' }, 'wait_for_result')
      .finally(() => {
        finished = true;
      });
    await settle();
    report(rig.db, first, 'motion_detection', true);
    await settle();
    expect(finished).toBe(false);
    report(rig.db, second, 'motion_detection', true);
    expect(await result).toMatchObject({ ok: true });

    const stuck = rig.set({ target: { device: first }, motionDetection: 'off' }, 'wait_for_result');
    await settle();
    rig.clock.advanceTo(new Date(NOW.getTime() + 60_000).toISOString());
    expect(await stuck).toMatchObject({ ok: false, class: 'Timeout' });
  });
});

describe('camera.set targets', () => {
  it('changes only the cameras of a room and does not list other devices as skipped', async () => {
    const rig = await home([FRONT, YARD, HALL_LAMP]);
    const result = await rig.set({ target: { room: rig.room.id }, motionDetection: 'on' });
    expect(sentTo(result).toSorted()).toStrictEqual(
      [rig.ids['Front door'], rig.ids['Yard']].toSorted(),
    );
    expect(skippedReasons(result)).toStrictEqual([]);
    expect(batches(rig.adapter)).toHaveLength(2);
  });

  it('changes every camera and doorbell of the home, reports an offline one and ignores other devices', async () => {
    const rig = await home([FRONT, YARD, BELL, UNPLUGGED, HALL_LAMP]);
    const result = await rig.set({ everyCamera: true, motionDetection: 'off' });
    expect(sentTo(result).toSorted()).toStrictEqual(
      [rig.ids['Front door'], rig.ids['Yard'], rig.ids['Bell']].toSorted(),
    );
    expect(
      outcomeOf(result).skipped.map((entry) => [entry.device.device, entry.reason]),
    ).toStrictEqual([[rig.ids['Unplugged'], 'It is offline.']]);
  });

  it('reports a listed device that is not a camera', async () => {
    const rig = await home([FRONT, HALL_LAMP]);
    const result = await rig.set({
      target: { devices: [rig.ids['Front door'] ?? '', rig.ids['Hall lamp'] ?? ''] },
      motionDetection: 'on',
    });
    expect(sentTo(result)).toStrictEqual([rig.ids['Front door']]);
    expect(skippedReasons(result)).toStrictEqual(['It is not a camera.']);
  });

  it('is Invalid with no target, with both a target and every camera, and with nothing to change', async () => {
    const rig = await home([FRONT]);
    const target = { device: rig.ids['Front door'] ?? '' };
    expect(await rig.set({ motionDetection: 'on' })).toMatchObject({ ok: false, class: 'Invalid' });
    expect(await rig.set({ target, everyCamera: true, motionDetection: 'on' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(await rig.set({ target })).toMatchObject({ ok: false, class: 'Invalid' });
    expect(rig.adapter.executed).toStrictEqual([]);
    expect(rig.adapter.together).toStrictEqual([]);
  });
});

describe('camera.set understands each camera', () => {
  it('turns privacy on for a camera that has a privacy switch and for one that uses power', async () => {
    const rig = await home([FRONT, BELL]);
    const result = await rig.set({
      target: { devices: [rig.ids['Front door'] ?? '', rig.ids['Bell'] ?? ''] },
      privacy: 'on',
    });
    expect(sentTo(result)).toHaveLength(2);
    expect(batches(rig.adapter).map(valuesOf)).toContainEqual({ privacy_mode: true });
    expect(batches(rig.adapter).map(valuesOf)).toContainEqual({ power: false });
  });

  it('turns privacy off through power for a camera without a privacy switch', async () => {
    const rig = await home([BELL]);
    await rig.set({ target: { device: rig.ids['Bell'] ?? '' }, privacy: 'off' });
    expect(batches(rig.adapter).map(valuesOf)).toStrictEqual([{ power: true }]);
  });

  it('gives each camera only the settings it has and skips a camera with none of them', async () => {
    const rig = await home([FRONT, STILL]);
    const result = await rig.set({
      target: { devices: [rig.ids['Front door'] ?? '', rig.ids['Still'] ?? ''] },
      nightVision: 'on',
      statusLight: 'on',
    });
    expect(sentTo(result)).toStrictEqual([rig.ids['Front door']]);
    expect(skippedReasons(result)).toStrictEqual(['It has none of the camera settings asked for.']);
    expect(batches(rig.adapter).map(valuesOf)).toStrictEqual([
      { night_vision: 'on', status_light: true },
    ]);
  });

  it('refuses a night vision choice the camera does not offer and lists what it offers', async () => {
    const rig = await home([FRONT]);
    const result = await rig.set({
      target: { device: rig.ids['Front door'] ?? '' },
      nightVision: 'dim',
    });
    expect(result).toMatchObject({ ok: false, class: 'Refused' });
    expect(failureOf(result)).toContain('it offers off, on, auto');
    expect(batches(rig.adapter)).toStrictEqual([]);
  });

  it('skips cameras whose settings are read only', async () => {
    const rig = await home([FRONT, READ_ONLY]);
    const result = await rig.set({
      target: { devices: [rig.ids['Front door'] ?? '', rig.ids['Reader'] ?? ''] },
      privacy: 'on',
      motionDetection: 'on',
    });
    expect(sentTo(result)).toStrictEqual([rig.ids['Front door']]);
    expect(skippedReasons(result)).toHaveLength(1);
  });

  it('is Refused when no camera could be changed', async () => {
    const rig = await home([UNPLUGGED]);
    const result = await rig.set({ everyCamera: true, privacy: 'on' });
    expect(result).toMatchObject({ ok: false, class: 'Refused' });
    expect(failureOf(result)).toContain('It is offline.');
  });
});
