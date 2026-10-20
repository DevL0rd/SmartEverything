import {
  effectiveFitnessGoals,
  localDayOf,
  type BottleDayTotal,
  type HealthRecord,
  type ProfileRow,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';

type HydrationRecord = Extract<HealthRecord, { type: 'Hydration' }>;

const DAY_MS = 86_400_000;

const MS_PER_SECOND = 1000;

const ML_PER_LITRE = 1000;

const LARQ_SOURCE = 'smarteverything.larq';

const OWN_PREFIX = 'smarteverything.';

type WaterSource = 'bottle' | 'logged' | 'other';

export function goalMlOf(profile: Pick<ProfileRow, 'fitness_goals'>): number {
  return effectiveFitnessGoals(profile.fitness_goals).hydration_ml;
}

function waterSourceOf(record: Pick<HydrationRecord, 'sourceApp'>): WaterSource {
  if (record.sourceApp === LARQ_SOURCE) {
    return 'bottle';
  }
  return record.sourceApp.startsWith(OWN_PREFIX) ? 'logged' : 'other';
}

export function hydrationRecords(
  store: Pick<Store, 'health'>,
  profileId: string,
  window: { readonly from: string; readonly to: string },
): HydrationRecord[] {
  const from = new Date(Date.parse(`${window.from}T00:00:00Z`) - 2 * DAY_MS).toISOString();
  const to = new Date(Date.parse(`${window.to}T00:00:00Z`) + 3 * DAY_MS).toISOString();
  return store.health
    .records({ types: ['Hydration'], from, to }, profileId)
    .filter((record): record is HydrationRecord => record.type === 'Hydration');
}

export function dayTotalsOf(records: readonly HydrationRecord[], goalMl: number): BottleDayTotal[] {
  const days = new Map<string, { bottleMl: number; loggedMl: number; otherMl: number }>();
  for (const record of records) {
    const day = localDayOf(record);
    const sums = days.get(day) ?? { bottleMl: 0, loggedMl: 0, otherMl: 0 };
    const ml = record.data.liters * ML_PER_LITRE;
    const source = waterSourceOf(record);
    if (source === 'bottle') {
      sums.bottleMl += ml;
    } else if (source === 'logged') {
      sums.loggedMl += ml;
    } else {
      sums.otherMl += ml;
    }
    days.set(day, sums);
  }
  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, sums]) => ({
      day,
      goalMl,
      bottleMl: Math.round(sums.bottleMl),
      loggedMl: Math.round(sums.loggedMl),
      otherMl: Math.round(sums.otherMl),
      totalMl: Math.round(sums.bottleMl + sums.loggedMl + sums.otherMl),
    }));
}

export function hourlyOf(records: readonly HydrationRecord[], day: string): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const record of records) {
    if (localDayOf(record) !== day) {
      continue;
    }
    const local = new Date(
      Date.parse(record.startTime) + (record.zoneOffsetSeconds ?? 0) * MS_PER_SECOND,
    );
    const hour = local.getUTCHours();
    hours[hour] = (hours[hour] ?? 0) + Math.round(record.data.liters * ML_PER_LITRE);
  }
  return hours;
}
