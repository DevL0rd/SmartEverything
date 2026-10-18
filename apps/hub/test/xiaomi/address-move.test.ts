import type { DiscoveredDevice } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeMiioDevice } from './fake-device';
import { waitFor } from './harness';
import { createWorld, destroyWorld, startAdapter, subscribe, type World } from './world';

let world: World;
let relocated: FakeMiioDevice | null = null;

beforeEach(async () => {
  world = await createWorld();
});

afterEach(async () => {
  await relocated?.stop();
  relocated = null;
  await destroyWorld(world);
});

describe('a Xiaomi device that returns on another address', () => {
  it('follows the address the cloud now lists and goes back to the LAN', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    const recorded = await subscribe(world, adapter);
    const purifierOf = (): DiscoveredDevice | undefined =>
      recorded.devices.at(-1)?.find((device) => device.externalId === '100001');
    await waitFor(() => purifierOf()?.details['transport'] === 'lan', 5000);
    relocated = new FakeMiioDevice({
      host: '127.0.0.4',
      port: world.port,
      deviceId: 100001,
      token: '00112233445566778899aabbccddeeff',
      properties: { '2.1': true, '2.4': 0, '3.4': 12, '4.1': 80 },
    });
    await relocated.start();
    world.purifier.silent = true;
    const listed = world.cloud.devices.find((entry) => JSON.stringify(entry).includes('"100001"'));
    expect(listed).toBeDefined();
    if (typeof listed === 'object' && listed !== null && !Array.isArray(listed)) {
      Object.assign(listed, { localip: '127.0.0.4' });
    }
    await waitFor(() => (relocated?.handshakes ?? 0) > 0, 5000);
    await waitFor(() => purifierOf()?.details['transport'] === 'lan', 5000);
    expect(purifierOf()?.details['transportReason']).toEqual(
      expect.stringMatching(/the device moved from 127\.0\.0\.2 to 127\.0\.0\.4|127\.0\.0\.4/),
    );
  });
});
