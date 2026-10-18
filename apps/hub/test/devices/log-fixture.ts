import type { ClientRow, DeviceCapability, DeviceRow, ProfileRow } from '@smarteverything/domain';
import type { DeviceUpsert } from '../../src/database/port';
import type { Store } from '../../src/store/store';

export const POWER: DeviceCapability = {
  key: 'power',
  label: 'Power',
  access: 'read_write',
  value: { kind: 'boolean' },
};

export function clockAt(iso: string): { now: () => Date; set: (iso: string) => void } {
  let current = Date.parse(iso);
  return {
    now: (): Date => new Date(current),
    set: (next): void => {
      current = Date.parse(next);
    },
  };
}

export function addDevice(store: Store, overrides: Partial<DeviceUpsert> = {}): DeviceRow {
  const [device] = store.devices.upsert([
    {
      provider: 'tuya',
      externalId: 'plug-1',
      parentId: null,
      kind: 'plug',
      name: 'Plug',
      model: 'p1',
      manufacturer: 'Tuya',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [POWER],
      details: {},
      ...overrides,
    },
  ]);
  if (device === undefined) throw new Error('The test device was not stored.');
  return device;
}

export function addPerson(store: Store, name: string): { client: ClientRow; person: ProfileRow } {
  const person = store.profiles.update(store.profiles.first().id, { name });
  const client = store.clients.create({
    name: `${name}'s phone`,
    platform: 'android',
    role: 'owner',
    tokenHash: `hash-${name}`,
  });
  return { client, person };
}
