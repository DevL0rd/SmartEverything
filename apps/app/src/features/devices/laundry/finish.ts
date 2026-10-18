import { laundryDelayError, type LaundryDelay } from '@smarteverything/domain';
import { MINUTE_MS } from '../../../format/time';

export const MAX_DELAY_MINUTES = 2880;

export const FINISH_STEP = 15;

const DEFAULT_FINISH_HOUR = 7;

const MIN_LEAD = 15;

export function epochMinute(moment: number): number {
  return Math.floor(moment / MINUTE_MS);
}

export function earliestFinish(nowMinute: number, programMinutes: number | null): number {
  const lead = Math.max(MIN_LEAD, programMinutes ?? 0);
  return Math.ceil((nowMinute + lead) / FINISH_STEP) * FINISH_STEP;
}

export function latestFinish(nowMinute: number): number {
  return nowMinute + MAX_DELAY_MINUTES;
}

export function defaultFinish(now: number, programMinutes: number | null): number {
  const date = new Date(now);
  date.setHours(DEFAULT_FINISH_HOUR, 0, 0, 0);
  const earliest = earliestFinish(epochMinute(now), programMinutes);
  let target = epochMinute(date.getTime());
  while (target < earliest) {
    target += 1440;
  }
  return Math.min(target, latestFinish(epochMinute(now)));
}

export function delayOf(finishAt: number, nowMinute: number): LaundryDelay {
  return { mode: 'Finish Wash', minutes: finishAt - nowMinute };
}

export function finishError(
  finishAt: number,
  nowMinute: number,
  programMinutes: number | null,
): string | null {
  const minutes = finishAt - nowMinute;
  if (minutes > MAX_DELAY_MINUTES) {
    return 'The machine can wait at most 2 days.';
  }
  if (minutes < 1) {
    return 'Pick a time in the future.';
  }
  return laundryDelayError(delayOf(finishAt, nowMinute), programMinutes);
}

export function dayWord(finishAt: number, now: number): string {
  const days =
    new Date(finishAt * MINUTE_MS).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0);
  const apart = Math.round(days / (1440 * MINUTE_MS));
  if (apart <= 0) {
    return 'Today';
  }
  return apart === 1 ? 'Tomorrow' : `In ${String(apart)} days`;
}
