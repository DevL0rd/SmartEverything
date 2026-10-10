import {
  CommandRefusedError,
  DISCOVERED_DEVICE,
  type CapabilityKey,
  type DeviceCommand,
  type JsonValue,
  type DiscoveredDevice,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeMiioDevice } from './fake-device';
import { waitFor } from './harness';
import { createWorld, destroyWorld, startAdapter, subscribe, type World } from './world';

const LEGACY_TOKEN = '0123456789abcdef0123456789abcdef';
const SAVED = JSON.stringify([
  { idx: 1, pos: '[69,66]', name: 'Door' },
  { idx: 2, pos: '[10,10]' },
]);

let world: World;
let legacy: FakeMiioDevice;

beforeEach(async () => {
  world = await createWorld();
  world.cloud.cloudProperties.set('100003/10.1', SAVED);
  world.cloud.devices = [
    ...world.cloud.devices,
    {
      did: '100005',
      name: 'Hall camera',
      model: 'chuangmi.camera.ipc019',
      token: LEGACY_TOKEN,
      localip: '127.0.0.4',
      isOnline: true,
    },
    { did: '100006', name: 'Garage camera', model: 'chuangmi.camera.ipc019', isOnline: true },
  ];
  legacy = new FakeMiioDevice({
    host: '127.0.0.4',
    deviceId: 100005,
    token: LEGACY_TOKEN,
    properties: {},
    port: world.port,
  });
  await legacy.start();
});

afterEach(async () => {
  await legacy.stop();
  await destroyWorld(world);
});

function command(externalId: string, capability: CapabilityKey, value: JsonValue): DeviceCommand {
  return { commandId: crypto.randomUUID(), externalId, capability, value };
}

function byId(devices: readonly DiscoveredDevice[], externalId: string): DiscoveredDevice {
  const device = devices.find((candidate) => candidate.externalId === externalId);
  if (device === undefined) {
    throw new Error(`device ${externalId} was not discovered`);
  }
  return device;
}

function presetOptions(device: DiscoveredDevice): readonly string[] | null {
  const preset = device.capabilities.find((capability) => capability.key === 'ptz_preset');
  return preset?.value.kind === 'enum' ? preset.value.options : null;
}

const MISS_MOTOR = 'MISS command 0x112 through go2rtc /api/xiaomi/motor';

function keys(device: DiscoveredDevice): string[] {
  return device.capabilities.map((capability) => capability.key);
}

describe('Xiaomi pan and tilt', () => {
  it('offers arrows, home and saved positions on a MISS camera and names every mechanism', async () => {
    const devices = await (await startAdapter(world)).discover();
    const camera = byId(devices, '100003');
    expect(DISCOVERED_DEVICE.safeParse(camera).success).toBe(true);
    expect(camera.details).toMatchObject({
      physicalPtz: true,
      ptz: `moves: ${MISS_MOTOR}; home: ${MISS_MOTOR} operation 5; presets: MIoT property 10.2 active-fav-area`,
    });
    expect(presetOptions(camera)).toStrictEqual(['Door', 'Position 2']);
    expect(camera.capabilities).toContainEqual({
      key: 'ptz',
      label: 'Pan and tilt',
      access: 'write',
      value: { kind: 'action', arguments: ['direction'] },
    });
  });

  it('moves a MISS camera and sends it home over the session go2rtc holds', async () => {
    world.go2rtc.playing.add('stream-100003');
    const adapter = await startAdapter(world);
    await adapter.discover();
    for (const direction of ['left', 'right', 'up', 'down', 'home']) {
      await expect(adapter.execute(command('100003', 'ptz', { direction }))).resolves.toStrictEqual(
        { direction },
      );
    }
    expect(world.go2rtc.calls).toStrictEqual(
      [1, 2, 3, 4, 5].map((operation) => ({ stream: 'stream-100003', operation })),
    );
    expect(world.go2rtc.requests[0]).toBe('POST /api/xiaomi/motor?src=stream-100003&operation=1');
    expect(world.cloud.rpcs).toStrictEqual([]);
    expect(
      world.harness.logs.find((record) => record.event === 'xiaomi_camera.ptz_moved')?.payload,
    ).toStrictEqual({ did: '100003', via: 'go2rtc', operation: 1 });
  });

  it('asks for the live view when go2rtc is not streaming the camera', async () => {
    world.go2rtc.idle.add('stream-100003');
    const adapter = await startAdapter(world);
    await adapter.discover();
    await expect(adapter.execute(command('100003', 'ptz', { direction: 'up' }))).rejects.toThrow(
      new CommandRefusedError(
        'ptz',
        'the camera moves only while its stream is playing; open its live view and try again',
      ),
    );
    expect(world.go2rtc.calls).toStrictEqual([]);
  });

  it('reports a motor command the camera did not take with the go2rtc answer', async () => {
    world.go2rtc.playing.add('stream-100003');
    world.go2rtc.failWith = "cs2: can't send command 4097";
    const adapter = await startAdapter(world);
    await adapter.discover();
    await expect(adapter.execute(command('100003', 'ptz', { direction: 'up' }))).rejects.toThrow(
      "go2rtc refused xiaomi.motor with HTTP 502: xiaomi: motor: cs2: can't send command 4097.",
    );
    world.go2rtc.playing.delete('stream-100003');
    await expect(adapter.execute(command('100003', 'ptz', { direction: 'up' }))).rejects.toThrow(
      'go2rtc refused xiaomi.motor with HTTP 404: xiaomi: motor: no stream "stream-100003".',
    );
  });

  it('keeps MISS cameras without arrows when the hub has no go2rtc motor endpoint', async () => {
    const adapter = await startAdapter(world, 'absent');
    const camera = byId(await adapter.discover(), '100003');
    expect(camera.details).toMatchObject({
      physicalPtz: true,
      ptz: "moves: none: this hub was started without go2rtc's Xiaomi motor endpoint; home: MIoT action 2.1 ptz-calibrate; presets: MIoT property 10.2 active-fav-area",
    });
    expect(keys(camera)).not.toContain('ptz');
    expect(keys(camera)).toContain('ptz_preset');
    await expect(adapter.execute(command('100003', 'ptz', { direction: 'left' }))).rejects.toThrow(
      new CommandRefusedError('ptz', 'the device does not have it'),
    );
  });

  it('keeps a MISS camera without a LAN address, and so without a stream, without arrows', async () => {
    world.cloud.devices = [
      ...world.cloud.devices,
      { did: '100007', name: 'Shed camera', model: 'xiaomi.camera.091ac1', isOnline: true },
    ];
    const camera = byId(await (await startAdapter(world)).discover(), '100007');
    expect(camera.details).toMatchObject({
      physicalPtz: true,
      ptz: 'moves: none: the camera has no LAN address, so go2rtc holds no stream for it; home: MIoT action 2.1 ptz-calibrate; presets: MIoT property 10.2 active-fav-area',
    });
    expect(camera.details).not.toHaveProperty('go2rtcSource');
    expect(keys(camera)).not.toContain('ptz');
  });

  it('turns the camera to a saved position through active-fav-area', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    await expect(adapter.execute(command('100003', 'ptz_preset', 'Position 2'))).resolves.toBe(
      'Position 2',
    );
    expect(world.cloud.cloudProperties.get('100003/10.2')).toBe(2);
  });

  it('republishes the positions when the saved list changes on the camera', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    const recorded = await subscribe(world, adapter);
    world.cloud.cloudProperties.set('100003/10.1', JSON.stringify([{ idx: 3, name: 'Garden' }]));
    await waitFor(() =>
      recorded.devices.some(
        (devices) => presetOptions(byId(devices, '100003'))?.join() === 'Garden',
      ),
    );
    await expect(adapter.execute(command('100003', 'ptz_preset', 'Garden'))).resolves.toBe(
      'Garden',
    );
    expect(world.cloud.cloudProperties.get('100003/10.2')).toBe(3);
  });

  it('moves a legacy chuangmi camera with set_motor over the LAN and refuses home', async () => {
    const adapter = await startAdapter(world);
    const camera = byId(await adapter.discover(), '100005');
    expect(camera.details).toMatchObject({
      transport: 'lan',
      physicalPtz: true,
      ptz: 'moves: miIO set_motor; home: none; presets: none',
    });
    expect(camera.capabilities).toContainEqual({
      key: 'ptz',
      label: 'Pan and tilt',
      access: 'write',
      value: { kind: 'action', arguments: ['direction'] },
    });
    await expect(
      adapter.execute(command('100005', 'ptz', { direction: 'left' })),
    ).resolves.toStrictEqual(['ok']);
    expect(legacy.requests.map(({ method, params }) => ({ method, params }))).toContainEqual({
      method: 'set_motor',
      params: { operation: 1 },
    });
    await expect(adapter.execute(command('100005', 'ptz', { direction: 'home' }))).rejects.toThrow(
      new CommandRefusedError(
        'ptz',
        'chuangmi.camera.ipc019 has no MIoT ptz-calibrate action to return home',
      ),
    );
  });

  it('moves a legacy camera without a LAN address through the cloud miIO RPC', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    await adapter.execute(command('100006', 'ptz', { direction: 'up' }));
    expect(world.cloud.rpcs).toStrictEqual([
      { path: '/home/rpc/100006', data: { method: 'set_motor', params: { operation: 3 } } },
    ]);
    expect(
      world.harness.logs.find((record) => record.event === 'xiaomi_camera.ptz_moved')?.payload,
    ).toStrictEqual({
      did: '100006',
      via: 'miio',
      transport: 'cloud',
    });
  });

  it('logs saved positions it cannot read and keeps the camera without them', async () => {
    world.cloud.cloudProperties.set('100003/10.1', 'nope');
    const devices = await (await startAdapter(world)).discover();
    expect(presetOptions(byId(devices, '100003'))).toBeNull();
    expect(
      world.harness.logs.find((record) => record.event === 'xiaomi_camera.positions_unreadable')
        ?.payload,
    ).toMatchObject({ did: '100003' });
  });

  it('logs a failed read of the saved positions during discovery', async () => {
    world.cloud.failPaths.add('/miotspec/prop/get');
    const devices = await (await startAdapter(world)).discover();
    expect(presetOptions(byId(devices, '100003'))).toBeNull();
    expect(
      world.harness.logs.find((record) => record.event === 'xiaomi_camera.positions_failed')
        ?.payload,
    ).toMatchObject({ did: '100003', transport: 'cloud' });
  });
});
