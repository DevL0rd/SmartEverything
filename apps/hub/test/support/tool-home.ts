import type { DeviceCapability, DeviceRow, RoomRow } from '@smarteverything/domain';
import type { DeviceUpsert } from '../../src/database/port';
import type { Store } from '../../src/store/store';

const SWITCH: DeviceCapability = {
  key: 'privacy_mode',
  label: 'Privacy',
  access: 'read_write',
  value: { kind: 'boolean' },
};

const POWER: DeviceCapability = {
  key: 'power',
  label: 'Power',
  access: 'read_write',
  value: { kind: 'boolean' },
};

export interface ToolHome {
  readonly study: RoomRow;
  readonly hall: RoomRow;
  readonly lamp: DeviceRow;
  readonly camera: DeviceRow;
  readonly other: DeviceRow;
}

interface Furnishing {
  readonly externalId: string;
  readonly kind: string;
  readonly name: string;
  readonly roomId: string | null;
  readonly capabilities: readonly DeviceCapability[];
}

function deviceUpsert(furnishing: Furnishing): DeviceUpsert {
  return {
    provider: 'xiaomi',
    externalId: furnishing.externalId,
    parentId: null,
    kind: furnishing.kind,
    name: furnishing.name,
    model: 'model.one',
    manufacturer: 'Maker',
    providerRoom: null,
    roomId: furnishing.roomId,
    online: true,
    capabilities: furnishing.capabilities,
    details: {},
  };
}

function stored(rows: readonly DeviceRow[], index: number): DeviceRow {
  const row = rows[index];
  if (row === undefined) {
    throw new Error('the device was not stored');
  }
  return row;
}

export function furnishHome(store: Store): ToolHome {
  const study = store.rooms.create('Study', 0);
  const hall = store.rooms.create('Hall', 1);
  const rows = store.devices.upsert([
    deviceUpsert({
      externalId: 'lamp-1',
      kind: 'light',
      name: 'Desk lamp',
      roomId: study.id,
      capabilities: [POWER],
    }),
    deviceUpsert({
      externalId: 'camera-1',
      kind: 'camera',
      name: 'Front door',
      roomId: hall.id,
      capabilities: [SWITCH],
    }),
    deviceUpsert({
      externalId: 'camera-2',
      kind: 'camera',
      name: 'Back door',
      roomId: hall.id,
      capabilities: [SWITCH],
    }),
  ]);
  return {
    study,
    hall,
    lamp: stored(rows, 0),
    camera: stored(rows, 1),
    other: stored(rows, 2),
  };
}
