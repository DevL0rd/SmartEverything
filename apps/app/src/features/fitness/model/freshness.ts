import { dayAge, daysBetween } from '../../../format/time';

const STALE_AFTER_DAYS = 2;

export interface Freshness {
  readonly current: boolean;
  readonly label: string;
  readonly stale: boolean;
}

export function freshnessOf(day: string, selected: string): Freshness {
  const days = daysBetween(day, selected);
  return { current: days <= 0, label: dayAge(day, selected), stale: days > STALE_AFTER_DAYS };
}
