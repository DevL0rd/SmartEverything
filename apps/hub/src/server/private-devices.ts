import type { LocalDriver } from '@smarteverything/domain';
import { BOTTLE_DRIVER, entryConfigOf } from '../local/bottle/config';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';
import type { Store } from '../store/store';

interface PrivateDriver {
  readonly driver: LocalDriver;
  readonly personOf: (entry: LocalDeviceEntry) => string | null;
}

const PRIVATE_DRIVERS: readonly PrivateDriver[] = [
  { driver: BOTTLE_DRIVER, personOf: (entry) => entryConfigOf(entry).binding.profileId },
];

export function devicesPrivateToOthers(
  store: Pick<Store, 'localDevices' | 'devices'>,
  profileId: string,
): string[] {
  return PRIVATE_DRIVERS.flatMap(({ driver, personOf }) =>
    store.localDevices.ofDriver(driver).flatMap((entry) => {
      if (personOf(entry) === profileId) {
        return [];
      }
      const device = store.devices.byExternal('local', entry.externalId);
      return device === undefined ? [] : [device.id];
    }),
  );
}
