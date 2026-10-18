import {
  DEVICE_CAPABILITY,
  DEVICE_ROW,
  presentDevice,
  type JsonValue,
  isLaundryValueRole,
  type LaundryValueRole,
} from '@smarteverything/domain';
import { z } from 'zod';
import capabilities from '../../../../../../packages/domain/test/fixtures/mibx5-f29gl-capabilities.json';
import { deviceOf, type Device, type DeviceValues } from '../../../store/state';
import { snapshotOf } from './snapshot';
import { laundryOf, type Laundry } from './use-laundry';

const WASHER_ID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
export const AT = '2026-10-17T12:00:00.000Z';

export function washerDevice(online = true): Device {
  return deviceOf(
    DEVICE_ROW.parse({
      id: WASHER_ID,
      provider: 'xiaomi',
      external_id: '2196840485',
      parent_id: null,
      kind: 'appliance',
      name: 'Washing/Drying Machine',
      display_name: null,
      model: 'mibx5.washer.f29gl',
      manufacturer: 'Xiaomi',
      provider_room: null,
      room_id: null,
      online,
      capabilities: z.array(DEVICE_CAPABILITY).parse(capabilities),
      details: {},
      hidden: false,
      favourite: false,
      position: 0,
      created_at: AT,
      updated_at: AT,
    }),
  );
}

type RoleValues = Readonly<Partial<Record<LaundryValueRole, JsonValue>>>;

export function washerValues(roles: RoleValues, device: Device = washerDevice()): DeviceValues {
  const values: Record<string, { value: JsonValue; observedAt: string }> = {};
  for (const { key, role } of presentDevice(device).capabilities) {
    const value = isLaundryValueRole(role) ? roles[role] : undefined;
    if (value !== undefined) {
      values[key] = { value, observedAt: AT };
    }
  }
  return values;
}

export function washerLaundry(roles: RoleValues, online = true): Laundry {
  const device = washerDevice(online);
  const presentation = presentDevice(device);
  return laundryOf(
    device,
    presentation,
    snapshotOf(presentation, washerValues(roles, device), online),
  );
}
