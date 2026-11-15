export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const SEED = 20261114;
export const HISTORY_DAYS = 90;

export interface Anchor {
  readonly now: Date;
  readonly today: Date;
}

export function anchorAt(now: Date): Anchor {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { now, today };
}

export function daysAgo(anchor: Anchor, days: number, hour = 0, minute = 0): Date {
  return new Date(anchor.today.getTime() - days * DAY_MS + hour * HOUR_MS + minute * 60_000);
}

export function dayKey(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}
