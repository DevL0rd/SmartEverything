import { DAY_MS, clock, localDayKey, shortDate, weekdayShort } from '../../../format/time';

const WEEK_MS = 7 * DAY_MS;

export function chatListTime(at: string, now: number, timeZone: string | null): string {
  if (localDayKey(at, timeZone) === localDayKey(now, timeZone)) {
    return clock(at, timeZone);
  }
  const moment = Date.parse(at);
  return now - moment < WEEK_MS ? weekdayShort(moment) : shortDate(moment);
}
