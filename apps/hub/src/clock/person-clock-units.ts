import { CLIENT_PREFS } from '@smarteverything/domain';
import type { HostStore } from '../store/host/host-store';
import { storeUnit } from '../store/host/unit';
import { clockTextIn } from './person-clock';

export type PersonClockStore = Pick<HostStore, 'personal'>;

export function personHour24(store: PersonClockStore, profileId: string): boolean {
  const read = store.personal.profilePref(CLIENT_PREFS.clock_format, profileId);
  if (read.status === 'invalid') {
    throw new Error(`The stored clock format of person ${profileId} is invalid: ${read.reason}`);
  }
  return read.value.hour24;
}

export function personClockText(
  store: PersonClockStore,
  profileId: string,
  at: Date | string,
  timeZone: string,
): string {
  return clockTextIn(at, timeZone, personHour24(store, profileId));
}

export const PERSON_HOUR24_UNIT = storeUnit(
  (store, { profileId }: { readonly profileId: string }): boolean => personHour24(store, profileId),
);
