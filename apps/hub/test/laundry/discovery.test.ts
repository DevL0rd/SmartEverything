import {
  UNLOAD_PENDING_KEY,
  presentDevice,
  type DeviceRow,
  type DiscoveredDevice,
  DEVICE_ROW,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { discoveredDevice, type InventoryEntry } from '../../src/adapters/xiaomi/inventory';

const TRANSPORT = {
  transport: 'cloud',
  online: true,
  reason: 'test',
  updates: 'push',
  pushSource: null,
  pushSince: null,
} as const;

function entry(model: string, kind: InventoryEntry['model']['kind']): InventoryEntry {
  return {
    cloud: {
      did: 'did-1',
      name: 'Device',
      model,
      token: null,
      ip: null,
      mac: null,
      parentDid: null,
      online: true,
      specType: null,
    },
    room: null,
    spec: null,
    model: { kind, capabilities: [], bindings: new Map(), propertyKeys: new Map(), problems: [] },
    specProblem: null,
    ptz: null,
  };
}

function discover(model: string, kind: InventoryEntry['model']['kind']): DiscoveredDevice {
  return discoveredDevice(
    entry(model, kind),
    TRANSPORT,
    { userId: '1', region: 'de' },
    new Set<string>(),
  );
}

describe('washer discovery', () => {
  it('gives every washer the hub-kept unload-pending reading', () => {
    const device = discover('mibx5.washer.f29gl', 'appliance');
    expect(device.capabilities.map((capability) => capability.key)).toEqual([UNLOAD_PENDING_KEY]);
  });

  it('gives other devices nothing extra', () => {
    expect(discover('yeelink.light.lamp1', 'light').capabilities).toEqual([]);
  });

  it('presents the reading as a washer cycle reading', () => {
    const device = discover('mibx5.washer.f29gl', 'appliance');
    const row: DeviceRow = DEVICE_ROW.parse({
      id: '1d000000-0000-4000-8000-0000000000b1',
      provider: 'xiaomi',
      external_id: device.externalId,
      parent_id: null,
      kind: device.kind,
      name: device.name,
      display_name: null,
      model: device.model,
      manufacturer: device.manufacturer,
      provider_room: null,
      room_id: null,
      online: true,
      capabilities: device.capabilities,
      details: {},
      hidden: false,
      favourite: false,
      position: 0,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    });
    const reading = presentDevice(row).capabilities.find(
      (capability) => capability.key === UNLOAD_PENDING_KEY,
    );
    expect(reading).toMatchObject({ role: 'unload_pending', label: 'Waiting to be unloaded' });
  });
});
