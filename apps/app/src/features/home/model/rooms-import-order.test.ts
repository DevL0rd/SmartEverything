import { beforeEach, describe, expect, it, vi } from 'vitest';

async function summariesOf(): Promise<readonly { readonly devices: number }[]> {
  const { deviceFixture, stateFixture, valuesFixture } =
    await import('../../../store/device-fixture');
  const { roomSummaries } = await import('./rooms');
  const devices = Array.from({ length: 6 }, (_, index) => deviceFixture(index));
  const state = stateFixture(
    devices,
    Object.fromEntries(devices.map((device, index) => [device.id, valuesFixture(index, 0)])),
  );
  return roomSummaries(state);
}

describe('home rooms module evaluation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves powerStateOf when the rooms model is imported first', async () => {
    const rooms = await summariesOf();
    const devices = await import('../../devices');
    expect(devices.powerStateOf).toBeTypeOf('function');
    expect(rooms.length).toBeGreaterThan(0);
  });

  it('resolves powerStateOf when the devices barrel is imported first', async () => {
    const devices = await import('../../devices');
    expect(devices.powerStateOf).toBeTypeOf('function');
    const rooms = await summariesOf();
    expect(rooms.length).toBeGreaterThan(0);
  });
});
