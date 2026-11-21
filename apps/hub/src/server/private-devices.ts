import type { LocalDriver } from '@smarteverything/domain';
import { BOTTLE_DRIVER, entryConfigOf } from '../local/bottle/config';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';
import type { HostStore } from '../store/host/host-store';

interface PrivateDriver {
  readonly driver: LocalDriver;
  readonly personOf: (entry: LocalDeviceEntry) => string | null;
}

export interface PrivateDevice {
  readonly deviceId: string;
  readonly profileId: string | null;
}

const PRIVATE_DRIVERS: readonly PrivateDriver[] = [
  { driver: BOTTLE_DRIVER, personOf: (entry) => entryConfigOf(entry).binding.profileId },
];

export function privateDevicesOf(
  store: Pick<HostStore, 'localDevices' | 'devices'>,
): PrivateDevice[] {
  return PRIVATE_DRIVERS.flatMap(({ driver, personOf }) =>
    store.localDevices.ofDriver(driver).flatMap((entry) => {
      const device = store.devices.byExternal('local', entry.externalId);
      return device === undefined ? [] : [{ deviceId: device.id, profileId: personOf(entry) }];
    }),
  );
}

export function privateToOthers(devices: readonly PrivateDevice[], profileId: string): string[] {
  return devices
    .filter((device) => device.profileId !== profileId)
    .map((device) => device.deviceId);
}

export function devicesPrivateToOthers(
  store: Pick<HostStore, 'localDevices' | 'devices'>,
  profileId: string,
): string[] {
  return privateToOthers(privateDevicesOf(store), profileId);
}
