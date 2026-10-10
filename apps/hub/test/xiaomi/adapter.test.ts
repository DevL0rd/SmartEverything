import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CommandRefusedError, DISCOVERED_DEVICE } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { USER_ID } from './fake-account';
import { createWorld, destroyWorld, startAdapter, subscribe, type World } from './world';

let world: World;

beforeEach(async () => {
  world = await createWorld();
});

afterEach(async () => {
  await destroyWorld(world);
});

describe('the Xiaomi inventory', () => {
  it('lists every device with its room, parent, transport and catalogue capabilities', async () => {
    const devices = await (await startAdapter(world)).discover();
    for (const device of devices) {
      expect(DISCOVERED_DEVICE.safeParse(device).success).toBe(true);
    }
    const byId = new Map(devices.map((device) => [device.externalId, device]));
    expect(byId.get('100001')).toMatchObject({
      kind: 'air_purifier',
      room: 'Living room',
      manufacturer: 'zhimi',
      parentExternalId: null,
      details: {
        transport: 'lan',
        ip: '127.0.0.2',
        specType: 'urn:miot-spec-v2:device:air-purifier:0000A007:zhimi-mb5:1',
      },
    });
    expect(byId.get('100001')?.details['polling']).toBe(
      'lan-poll every 0.08 s: miIO and the MIoT cloud offer no push to this hub',
    );
    expect(byId.get('lumi.158d0001')).toMatchObject({
      kind: 'sensor',
      parentExternalId: '100002',
      room: null,
      details: { transport: 'cloud', transportReason: 'it is reached through its gateway 100002' },
    });
    expect(byId.get('100002')?.details['transportReason']).toBe(
      'the cloud reports no LAN address for it',
    );
    expect(byId.get('100004')).toMatchObject({
      kind: 'other',
      online: false,
      capabilities: [],
      details: { specType: null, polling: 'none: the device has no readable MIoT properties' },
    });
    expect(byId.get('100004')?.details['specProblem']).toEqual(
      expect.stringContaining('a released MIoT spec for this model'),
    );
  });

  it('streams cameras through the go2rtc xiaomi source and falls back to the cloud when the LAN is silent', async () => {
    const devices = await (await startAdapter(world)).discover();
    const camera = devices.find((device) => device.externalId === '100003');
    expect(camera?.details).toMatchObject({
      go2rtcSource: `xiaomi://${USER_ID}:de@127.0.0.3?did=100003&model=xiaomi.camera.091ac1`,
      twoWayAudio: true,
      physicalPtz: true,
      transport: 'cloud',
      cameraEvents: 'camera-events every 0.08 s: Xiaomi offers no event push to this hub',
    });
    expect(camera?.details['transportReason']).toEqual(
      expect.stringMatching(
        /^the LAN handshake with 127\.0\.0\.3 failed: MiioTimeoutError: The device at 127\.0\.0\.3 did not answer the miIO handshake within 150 ms\.$/,
      ),
    );
    expect(camera?.capabilities.map((capability) => capability.key)).toEqual(
      expect.arrayContaining(['camera_stream', 'call_status', 'night_vision', 'motion_detection']),
    );
  });

  it('caches MIoT specs in the data directory and reuses them on the next start', async () => {
    await (await startAdapter(world)).discover();
    const downloads = world.cloud.specDownloads.length;
    expect(downloads).toBe(5);
    const cached = await readdir(join(world.harness.context.dataDirectory, 'miot-specs'));
    expect(cached).toHaveLength(4);
    await (await startAdapter(world)).discover();
    expect(world.cloud.specDownloads.slice(downloads)).toStrictEqual([
      '/miot-spec-v2/instances?status=released',
    ]);
  });
});

describe('reading and writing Xiaomi devices', () => {
  it('refreshes state over the LAN and the cloud with values in catalogue form', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    const states = await adapter.refresh(['100001', 'lumi.158d0001', 'unknown']);
    const values = Object.fromEntries(
      states.map((state) => [`${state.externalId}/${state.capability}`, state.value]),
    );
    expect(values).toMatchObject({
      '100001/power': true,
      '100001/purifier_mode': 'Auto',
      '100001/pm25': 12,
      '100001/filter_life': 80,
      'lumi.158d0001/motion': false,
      'lumi.158d0001/illuminance': 120,
    });
    expect(world.purifier.requests.every((request) => request.method === 'get_properties')).toBe(
      true,
    );
    expect(world.purifier.requests.every((request) => request.stamp > 1000)).toBe(true);
  });

  it('writes a LAN setting, converts enum labels and reports the new state', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    const recorded = await subscribe(world, adapter);
    await adapter.refresh(['100001']);
    await expect(
      adapter.execute({
        commandId: crypto.randomUUID(),
        externalId: '100001',
        capability: 'purifier_mode',
        value: 'Sleep',
      }),
    ).resolves.toBe('Sleep');
    expect(world.purifier.properties.get('2.4')).toBe(1);
    expect(recorded.states.map((state) => [state.capability, state.value])).toContainEqual([
      'purifier_mode',
      'Sleep',
    ]);
  });

  it('runs actions with their named arguments', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    await adapter.execute({
      commandId: crypto.randomUUID(),
      externalId: '100001',
      capability: 'filter_reset',
      value: { 'filter-used-time': 30 },
    });
    expect(world.purifier.actions).toStrictEqual([{ siid: 4, aiid: 1, inputs: [30] }]);
    await expect(
      adapter.execute({
        commandId: crypto.randomUUID(),
        externalId: '100001',
        capability: 'filter_reset',
        value: {},
      }),
    ).rejects.toThrow(
      new CommandRefusedError('filter_reset', 'the argument filter-used-time is missing'),
    );
  });

  it('writes cloud settings through the signed MIoT cloud API', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    await adapter.execute({
      commandId: crypto.randomUUID(),
      externalId: '100003',
      capability: 'night_vision',
      value: 'Off',
    });
    expect([...world.cloud.cloudProperties.entries()]).toContainEqual(['100003/2.3', 0]);
  });

  it('refuses commands for unknown devices, read-only capabilities and the live view', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    await expect(
      adapter.execute({
        commandId: crypto.randomUUID(),
        externalId: 'nope',
        capability: 'power',
        value: true,
      }),
    ).rejects.toThrow(
      new CommandRefusedError('power', 'no Xiaomi device nope is known to this hub'),
    );
    await expect(
      adapter.execute({
        commandId: crypto.randomUUID(),
        externalId: '100001',
        capability: 'pm25',
        value: 3,
      }),
    ).rejects.toThrow(new CommandRefusedError('pm25', 'it can only be read'));
    await expect(
      adapter.execute({
        commandId: crypto.randomUUID(),
        externalId: '100003',
        capability: 'camera_stream',
        value: 'x',
      }),
    ).rejects.toThrow(new CommandRefusedError('camera_stream', 'it can only be read'));
  });
});
