import type { BottleCareView, BottleFilterStatus } from '@smarteverything/domain';
import { clock, HOUR_MS, shortDate, startOfDayKey } from '../../../format/time';

const SELF_CLEAN_HOURS = 2;

export interface Freshness {
  readonly label: 'Fresh' | 'Not recent' | 'Never cleaned';
  readonly fresh: boolean;
  readonly next: string | null;
}

export function freshnessOf(care: BottleCareView, now: number): Freshness {
  const last = care.uvRecent[0];
  if (last === undefined) {
    return { label: 'Never cleaned', fresh: false, next: null };
  }
  const elapsed = now - Date.parse(last.at);
  const maintenance = care.uvRecent.find((row) => row.mode === 'maintenance');
  const due =
    maintenance === undefined ? null : Date.parse(maintenance.at) + SELF_CLEAN_HOURS * HOUR_MS;
  const fresh = elapsed <= (SELF_CLEAN_HOURS + 1) * HOUR_MS;
  return {
    label: fresh ? 'Fresh' : 'Not recent',
    fresh,
    next: due !== null && due > now ? `Next self-clean about ${clock(due)}` : null,
  };
}

export interface ModeTotal {
  readonly mode: 'normal' | 'adventure' | 'maintenance';
  readonly count: number;
  readonly share: number;
}

export function modeTotals(care: BottleCareView): readonly ModeTotal[] {
  const sum = (pick: (day: BottleCareView['uvDays'][number]) => number): number =>
    care.uvDays.reduce((total, day) => total + pick(day), 0);
  const counts = [
    { mode: 'normal' as const, count: sum((day) => day.normal) },
    { mode: 'adventure' as const, count: sum((day) => day.adventure) },
    { mode: 'maintenance' as const, count: sum((day) => day.maintenance) },
  ];
  const all = counts.reduce((total, entry) => total + entry.count, 0);
  return counts.map((entry) => ({ ...entry, share: all > 0 ? entry.count / all : 0 }));
}

export interface BatteryScale {
  readonly pct: number | null;
  readonly alert: number;
  readonly lockout: number;
  readonly line: string;
}

export function batteryScaleOf(battery: BottleCareView['battery']): BatteryScale {
  const pct = battery.pct;
  const days = battery.daysLeft === null ? '' : `, about ${String(battery.daysLeft)} days left`;
  return {
    pct,
    alert: battery.alertPct,
    lockout: battery.lockoutPct,
    line: pct === null ? 'Battery unknown' : `Battery ${String(pct)}%${days}`,
  };
}

export function dischargeSeries(
  points: BottleCareView['battery']['points'],
): readonly { readonly t: number; readonly v: number }[] {
  return points.map((point) => ({ t: Date.parse(point.at), v: point.pct }));
}

export function chargeLine(charge: BottleCareView['battery']['charges'][number]): string {
  const hours = (Date.parse(charge.endAt) - Date.parse(charge.startAt)) / HOUR_MS;
  return `${shortDate(charge.startAt)}: +${String(charge.gainedPct)}% in ${(Math.round(hours * 10) / 10).toString()} h`;
}

interface FilterRings {
  readonly litres: number;
  readonly days: number;
  readonly litresText: string;
  readonly daysText: string;
  readonly replaceBy: string | null;
  readonly due: boolean;
}

export function filterRingsOf(filter: BottleFilterStatus): FilterRings {
  return {
    litres: Math.min(1, filter.litresUsed / filter.litresLimit),
    days: Math.min(1, filter.daysUsed / filter.daysLimit),
    litresText: `${String(Math.round(filter.litresUsed * 10) / 10)} of ${String(filter.litresLimit)} L`,
    daysText: `${String(filter.daysUsed)} of ${String(filter.daysLimit)} days`,
    replaceBy: filter.replaceBy === null ? null : shortDate(startOfDayKey(filter.replaceBy)),
    due: filter.due,
  };
}
