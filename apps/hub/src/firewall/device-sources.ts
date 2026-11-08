import { isIP } from 'node:net';
import type { UnlearnedDevice } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { ANNOUNCEMENT_PORTS } from '../adapters/announcements';
import type { DeviceRecord } from '../database/port';
import { cameraSourceOf, pushSourceOf, vacuumVideoSourceOf } from '../state/inventory';
import { cameraAddressOf, type AnnouncementNeed, type DeviceAddress } from './openings';

export function camerasOf(devices: readonly DeviceRecord[], log: Logger): readonly DeviceAddress[] {
  return devices.flatMap((device) => {
    const source = cameraSourceOf(device) ?? vacuumVideoSourceOf(device);
    if (source === null) {
      return [];
    }
    const address = cameraAddressOf(source);
    if (address === null) {
      log.warn('firewall.camera_without_address', { deviceId: device.id });
      return [];
    }
    return [{ deviceId: device.id, address }];
  });
}

export function pushingOf(devices: readonly DeviceRecord[], log: Logger): readonly DeviceAddress[] {
  return devices.flatMap((device) => {
    const address = pushSourceOf(device);
    if (address === null) {
      return [];
    }
    if (isIP(address) === 0) {
      log.warn('firewall.push_source_not_address', { deviceId: device.id });
      return [];
    }
    return [{ deviceId: device.id, address }];
  });
}

export function identified<T extends DeviceAddress>(
  devices: readonly T[],
  known: ReadonlyMap<string, string>,
): {
  readonly identified: (T & { readonly mac: string })[];
  readonly unlearned: T[];
} {
  const identity = devices.flatMap((device) => {
    const mac = known.get(device.deviceId);
    return mac === undefined ? [] : [{ ...device, mac }];
  });
  return {
    identified: identity,
    unlearned: devices.filter((device) => !known.has(device.deviceId)),
  };
}

export function announcementsOf(devices: readonly DeviceRecord[]): readonly AnnouncementNeed[] {
  return devices.flatMap((device) =>
    (ANNOUNCEMENT_PORTS[device.provider] ?? []).map((listen): AnnouncementNeed => ({
      deviceId: device.id,
      ...listen,
    })),
  );
}

export function unlearnedOf(
  cameras: readonly DeviceAddress[],
  pushing: readonly DeviceAddress[],
): readonly UnlearnedDevice[] {
  return [
    ...cameras.map(({ deviceId, address }) => ({
      deviceId,
      address,
      purpose: 'camera' as const,
    })),
    ...pushing.map(({ deviceId, address }) => ({
      deviceId,
      address,
      purpose: 'device' as const,
    })),
  ];
}
