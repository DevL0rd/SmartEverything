import type { StoreHost } from '../store/host/host';

export function personHour24Of(host: StoreHost, profileId: string): Promise<boolean> {
  return host.read('personHour24', { profileId });
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
