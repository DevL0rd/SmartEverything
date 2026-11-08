import {
  ApiError,
  HUB_COMMAND,
  type DeviceCapability,
  type DiscoveredDevice,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  cameraCaptureEffects,
  type CameraCapturePorts,
  type ClipCommand,
  type ClipIssuer,
} from '../../../src/automations/effects/camera-capture';
import { IntegrationError } from '../../../src/automations/effects/integration-error';
import { commandBudgetMs } from '../../../src/commands/command-budgets';
import { Inventory } from '../../../src/state/inventory';
import { testDatabase, type TestDatabase } from '../../support/database';
import { NOW } from '../../support/executor-setup';
import { FakeClock } from '../../support/fake-clock';
import { CAMERA, LAMP } from '../../support/fake-provider';
import { testRun } from './support';

const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

function privacy(): DeviceCapability {
  return {
    key: 'privacy_mode',
    label: 'Privacy',
    access: 'read_write',
    value: { kind: 'boolean' },
  };
}

function camera(name: string, extra: Partial<DiscoveredDevice> = {}): DiscoveredDevice {
  return {
    ...CAMERA,
    externalId: name,
    parentExternalId: null,
    name,
    room: 'Hall',
    capabilities: [privacy()],
    ...extra,
  };
}

const FRONT = camera('Front door');
const YARD = camera('Yard');
const BELL = camera('Bell', { kind: 'doorbell' });
const UNPLUGGED = camera('Unplugged', { online: false });
const HALL_LAMP: DiscoveredDevice = {
  ...LAMP,
  externalId: 'Hall lamp',
  name: 'Hall lamp',
  room: 'Hall',
};

class ClipHub implements ClipIssuer {
  readonly issued: ClipCommand[] = [];
  private clips = 0;
  gate: Promise<void> = Promise.resolve();
  failure: Error | null = null;

  constructor(
    private readonly db: TestDatabase,
    private readonly clock: FakeClock,
  ) {}

  readonly issue: ClipIssuer['issue'] = async (commands) => {
    this.issued.push(...commands);
    await this.gate;
    if (this.failure !== null) throw this.failure;
    return commands.map((command) => {
      const parsed = HUB_COMMAND.parse({ capability: command.capability, value: command.value });
      if (parsed.capability !== 'hub:record_clip') throw new Error('not a clip command');
      const { deviceId, seconds } = parsed.value;
      this.clips += 1;
      const storagePath = `${deviceId}/clip-${String(this.clips)}-manual.mp4`;
      this.db.store.cameras.addRecording({
        deviceId,
        eventId: null,
        kind: 'clip',
        storagePath: `${deviceId}/clip-${String(this.clips)}-event.mp4`,
        startedAt: this.clock.now().toISOString(),
        durationMs: 1000,
        bytes: 5,
      });
      this.db.store.cameras.addRecording({
        deviceId,
        eventId: null,
        kind: 'clip',
        storagePath,
        startedAt: this.clock.now().toISOString(),
        durationMs: seconds * 1000,
        bytes: 10,
      });
      const [row] = this.db.store.commands.insert([
        {
          deviceId: null,
          capability: command.capability,
          value: command.value,
          source: 'automation',
          requestedBy: null,
        },
      ]);
      if (row === undefined) throw new Error('the command was not stored');
      return this.db.store.commands.finish(row.id, {
        status: 'succeeded',
        result: { storagePath, bytes: 10 },
      });
    });
  };
}

interface Taking {
  readonly deviceId: string;
  readonly size: string;
}

interface Rig {
  readonly db: TestDatabase;
  readonly hub: ClipHub;
  readonly ids: Readonly<Record<string, string>>;
  readonly roomId: string;
  readonly taking: Taking[];
  readonly failing: Map<string, Error>;
  readonly holding: { gate: Promise<void> };
  readonly run: ReturnType<typeof testRun>;
  readonly record: (
    params: EffectRequest['params'],
    mode?: EffectRequest['mode'],
  ) => Promise<NodeResult>;
  readonly snapshot: (params: EffectRequest['params']) => Promise<NodeResult>;
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
  const clock = new FakeClock(NOW.toISOString());
  const hub = new ClipHub(db, clock);
  const taking: Taking[] = [];
  const failing = new Map<string, Error>();
  const holding = { gate: Promise.resolve() };
  const ports: CameraCapturePorts = {
    store: db.store,
    clock,
    issuer: hub,
    pictures: {
      take: async (deviceId, size) => {
        taking.push({ deviceId, size });
        await holding.gate;
        const failure = failing.get(deviceId);
        if (failure !== undefined) throw failure;
        return { id: `picture-of-${deviceId}`, at: clock.now().toISOString() };
      },
    },
  };
  const handlers = cameraCaptureEffects(ports);
  const run = testRun();
  const perform = (
    kind: string,
    params: EffectRequest['params'],
    mode?: EffectRequest['mode'],
  ): Promise<NodeResult> => {
    const handler = handlers[kind];
    if (handler === undefined) throw new Error(`${kind} has no handler`);
    return handler(params, request(kind, params, mode), run);
  };
  return {
    db,
    hub,
    ids,
    roomId: room.id,
    taking,
    failing,
    holding,
    run,
    record: (params, mode) => perform('camera.record', params, mode),
    snapshot: (params) => perform('camera.snapshot', params),
  };
}

function reportPrivate(rig: Rig, name: string): void {
  rig.db.store.state.write([
    {
      deviceId: rig.ids[name] ?? '',
      capability: 'privacy_mode',
      value: true,
      observedAt: new Date(NOW.getTime() + 100).toISOString(),
    },
  ]);
}

function idOf(rig: Rig, name: string): string {
  return rig.ids[name] ?? '';
}

function failedWith(result: NodeResult): string {
  return result.ok ? 'ok' : result.class;
}

const SNAPSHOT = z.object({
  image: z.string(),
  at: z.string(),
  images: z.array(z.string()),
  cameras: z.array(z.object({ device: z.string() })),
  skipped: z.array(z.object({ device: z.object({ device: z.string() }), reason: z.string() })),
});

const SAVED = z.object({ recordingId: z.string(), at: z.string() });

function pictures(result: NodeResult): z.infer<typeof SNAPSHOT> {
  if (!result.ok) throw new Error(`the node failed: ${result.message}`);
  return SNAPSHOT.parse(result.value);
}

describe('camera.record', () => {
  it('sends one hub clip command for the camera and gives the saved clip when waiting', async () => {
    const rig = await home([FRONT]);
    const result = await rig.record(
      { camera: { camera: idOf(rig, 'Front door') }, seconds: 45 },
      'wait_for_result',
    );
    expect(rig.hub.issued).toEqual([
      {
        deviceId: null,
        capability: 'hub:record_clip',
        value: { deviceId: idOf(rig, 'Front door'), seconds: 45 },
      },
    ]);
    if (!result.ok) throw new Error(result.message);
    const saved = SAVED.parse(result.value);
    const clip = rig.db.store.cameras.recording(saved.recordingId);
    expect(clip).toMatchObject({
      device_id: idOf(rig, 'Front door'),
      kind: 'clip',
      storage_path: `${idOf(rig, 'Front door')}/clip-1-manual.mp4`,
      duration_ms: 45_000,
    });
    expect(saved.at).toBe(clip.started_at);
  });

  it('gives the clip command the hub clip budget, which is as long as the clip plus the finish', async () => {
    const rig = await home([FRONT]);
    await rig.record({ camera: idOf(rig, 'Front door'), seconds: 120 }, 'wait_for_result');
    const [command] = rig.hub.issued;
    expect(command).toBeDefined();
    expect(
      commandBudgetMs({
        capability: command?.capability ?? '',
        value: command?.value ?? null,
        deviceKind: null,
      }),
    ).toBeGreaterThan(120_000);
  });

  it('records 30 seconds when none are given', async () => {
    const rig = await home([FRONT]);
    await rig.record({ camera: idOf(rig, 'Front door') }, 'wait_for_result');
    expect(rig.hub.issued[0]?.value).toEqual({ deviceId: idOf(rig, 'Front door'), seconds: 30 });
  });

  it('continues at once when sending and records without waiting for the clip', async () => {
    const rig = await home([FRONT]);
    let release: () => void = () => undefined;
    rig.hub.gate = new Promise((resolve) => {
      release = resolve;
    });
    const result = await rig.record({ camera: idOf(rig, 'Front door'), seconds: 60 });
    expect(result).toEqual({ ok: true, value: {} });
    expect(rig.hub.issued).toHaveLength(1);
    expect(rig.db.store.cameras.recordings({ kind: 'clip', limit: 10 })).toEqual([]);
    release();
  });

  it('accepts exactly the seconds the hub accepts', async () => {
    const rig = await home([FRONT]);
    const camera = idOf(rig, 'Front door');
    expect(failedWith(await rig.record({ camera, seconds: 4 }, 'wait_for_result'))).toBe('Invalid');
    expect(failedWith(await rig.record({ camera, seconds: 301 }, 'wait_for_result'))).toBe(
      'Invalid',
    );
    expect(failedWith(await rig.record({ camera, seconds: 12.5 }, 'wait_for_result'))).toBe(
      'Invalid',
    );
    expect(rig.hub.issued).toEqual([]);
    expect((await rig.record({ camera, seconds: 5 }, 'wait_for_result')).ok).toBe(true);
    expect((await rig.record({ camera, seconds: 300 }, 'wait_for_result')).ok).toBe(true);
  });

  it('refuses an offline camera, a camera switched off for privacy and a lamp before any command', async () => {
    const rig = await home([FRONT, UNPLUGGED, HALL_LAMP]);
    reportPrivate(rig, 'Front door');
    const refusals = await Promise.all([
      rig.record({ camera: idOf(rig, 'Unplugged') }),
      rig.record({ camera: idOf(rig, 'Front door') }),
      rig.record({ camera: idOf(rig, 'Hall lamp') }),
      rig.record({ camera: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }),
    ]);
    expect(refusals.map(failedWith)).toEqual(['Unreachable', 'Refused', 'Invalid', 'NotFound']);
    expect(rig.hub.issued).toEqual([]);
  });

  it('reports a clip the hub could not record as a failure with the hub message', async () => {
    const rig = await home([FRONT]);
    rig.hub.failure = new ApiError('upstream_failed', 'The camera stream is down.');
    const result = await rig.record({ camera: idOf(rig, 'Front door') }, 'wait_for_result');
    expect(result).toMatchObject({ ok: false, class: 'Failed' });
  });

  it('stays cancellable while waiting for the clip', async () => {
    const rig = await home([FRONT]);
    rig.hub.gate = new Promise(() => undefined);
    const waiting = rig.record({ camera: idOf(rig, 'Front door') }, 'wait_for_result');
    rig.run.controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AutomationRunCancelledError' });
  });
});

describe('camera.snapshot with one or several cameras', () => {
  it('keeps the single image output for one camera and adds the list', async () => {
    const rig = await home([FRONT, YARD]);
    const front = idOf(rig, 'Front door');
    const done = pictures(await rig.snapshot({ camera: front, size: 'thumb' }));
    expect(done).toMatchObject({
      image: `picture-of-${front}`,
      images: [`picture-of-${front}`],
      cameras: [{ device: front }],
      skipped: [],
    });
    expect(rig.taking).toEqual([{ deviceId: front, size: 'thumb' }]);
    const wrapped = pictures(await rig.snapshot({ camera: { camera: front } }));
    expect(wrapped.image).toBe(`picture-of-${front}`);
    expect(rig.taking.at(-1)).toEqual({ deviceId: front, size: 'full' });
  });

  it('still fails with the camera error when the one camera cannot give a picture', async () => {
    const rig = await home([FRONT]);
    rig.failing.set(idOf(rig, 'Front door'), new IntegrationError('Refused', 'switched off'));
    expect(await rig.snapshot({ camera: idOf(rig, 'Front door') })).toMatchObject({
      ok: false,
      class: 'Refused',
      message: 'switched off',
    });
  });

  it('takes the pictures of several cameras together and lists them in one list', async () => {
    const rig = await home([FRONT, YARD]);
    const devices = [idOf(rig, 'Yard'), idOf(rig, 'Front door')];
    let release: () => void = () => undefined;
    rig.holding.gate = new Promise((resolve) => {
      release = resolve;
    });
    const waiting = rig.snapshot({ target: { devices } });
    await Promise.resolve();
    await Promise.resolve();
    expect([...rig.taking.map((entry) => entry.deviceId)].sort()).toEqual([...devices].sort());
    release();
    const done = pictures(await waiting);
    const order = done.cameras.map((entry) => entry.device);
    expect([...order].sort()).toEqual([...devices].sort());
    expect(done.images).toEqual(order.map((id) => `picture-of-${id}`));
    expect(done.image).toBe(done.images[0]);
  });

  it('takes a picture from every camera and doorbell of a room and no other device', async () => {
    const rig = await home([FRONT, BELL, HALL_LAMP]);
    const done = pictures(await rig.snapshot({ target: { room: rig.roomId } }));
    expect([...done.cameras.map((entry) => entry.device)].sort()).toEqual(
      [idOf(rig, 'Front door'), idOf(rig, 'Bell')].sort(),
    );
    expect(done.skipped).toEqual([]);
  });

  it('leaves out the cameras that give no picture, with the reason, and keeps the rest', async () => {
    const rig = await home([FRONT, YARD, HALL_LAMP]);
    rig.failing.set(idOf(rig, 'Yard'), new IntegrationError('Refused', 'Yard is private.'));
    const done = pictures(
      await rig.snapshot({
        target: {
          devices: [idOf(rig, 'Yard'), idOf(rig, 'Hall lamp'), idOf(rig, 'Front door')],
        },
      }),
    );
    expect(done.images).toEqual([`picture-of-${idOf(rig, 'Front door')}`]);
    expect(done.image).toBe(`picture-of-${idOf(rig, 'Front door')}`);
    expect(done.skipped).toHaveLength(2);
    expect(done.skipped).toContainEqual({
      device: { device: idOf(rig, 'Yard') },
      reason: 'Yard is private.',
    });
    expect(done.skipped).toContainEqual({
      device: { device: idOf(rig, 'Hall lamp') },
      reason: 'It is not a camera.',
    });
  });

  it('fails with the first camera error only when no camera gave a picture', async () => {
    const rig = await home([FRONT, YARD]);
    rig.failing.set(idOf(rig, 'Front door'), new IntegrationError('Unreachable', 'Front is down.'));
    rig.failing.set(idOf(rig, 'Yard'), new IntegrationError('Refused', 'Yard is private.'));
    expect(
      await rig.snapshot({ target: { devices: [idOf(rig, 'Front door'), idOf(rig, 'Yard')] } }),
    ).toMatchObject({ ok: false, class: 'Unreachable', message: 'Front is down.' });
  });

  it('asks for exactly one of a camera or several cameras', async () => {
    const rig = await home([FRONT]);
    const front = idOf(rig, 'Front door');
    expect(failedWith(await rig.snapshot({}))).toBe('Invalid');
    expect(failedWith(await rig.snapshot({ camera: front, target: { device: front } }))).toBe(
      'Invalid',
    );
    expect(rig.taking).toEqual([]);
  });
});
