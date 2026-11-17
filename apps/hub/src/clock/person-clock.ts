import { CLIENT_PREFS } from '@smarteverything/domain';
import type { Store } from '../store/store';

export type PersonClockStore = Pick<Store, 'personal'>;

export function personHour24(store: PersonClockStore, profileId: string): boolean {
  const read = store.personal.profilePref(CLIENT_PREFS.clock_format, profileId);
  if (read.status === 'invalid') {
    throw new Error(`The stored clock format of person ${profileId} is invalid: ${read.reason}`);
  }
  return read.value.hour24;
}

export function clockTextIn(at: Date | string, timeZone: string, hour24: boolean): string {
  const format = hour24
    ? new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone,
      })
    : new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone,
      });
  return format.format(new Date(at));
}

export function wallClockText(hour: number, minute: number, hour24: boolean): string {
  return clockTextIn(new Date(Date.UTC(2000, 0, 1, hour, minute)), 'UTC', hour24);
}

export function personClockText(
  store: PersonClockStore,
  profileId: string,
  at: Date | string,
  timeZone: string,
): string {
  return clockTextIn(at, timeZone, personHour24(store, profileId));
}
