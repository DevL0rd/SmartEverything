import type { HealthMetric } from '@smarteverything/domain';
import { dayKeyOf } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { Device, StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';

export interface StepsReading {
  readonly value: number;
  readonly at: string;
}

export interface TodaySteps extends StepsReading {
  readonly live: boolean;
}

function sameReading(left: StepsReading | null, right: StepsReading | null): boolean {
  return left === right || (left?.value === right?.value && left?.at === right?.at);
}

export type LiveMetric = 'steps' | 'active_energy';

const DETAIL_KEYS: Readonly<Record<LiveMetric, string>> = {
  steps: 'steps',
  active_energy: 'activeKcal',
};

function syncedFigure(
  state: StoreState,
  metric: HealthMetric,
  day: string,
  profileId: string | null,
): StepsReading | null {
  const table = state.tables.health_daily;
  for (const id of table.ids) {
    const row = table.byId[id];
    if (
      row?.metric === metric &&
      row.day === day &&
      (profileId === null || row.profile_id === profileId)
    ) {
      return { value: row.value, at: row.updated_at };
    }
  }
  return null;
}

export function reportedFigure(device: Device, metric: LiveMetric): StepsReading | null {
  const value = device.details[DETAIL_KEYS[metric]];
  const at = device.details['reportedAt'];
  return typeof value === 'number' && typeof at === 'string' ? { value, at } : null;
}

function profileOf(device: Device): string | null {
  const profile = device.details['profileId'];
  return typeof profile === 'string' ? profile : null;
}

function newer(left: StepsReading | null, right: StepsReading | null): StepsReading | null {
  if (left === null) {
    return right;
  }
  return right === null || Date.parse(left.at) >= Date.parse(right.at) ? left : right;
}

export function todayStepsOf(
  synced: StepsReading | null,
  live: StepsReading | null,
  today: string,
): TodaySteps | null {
  const current = live !== null && dayKeyOf(Date.parse(live.at)) === today ? live : null;
  if (current !== null && (synced === null || Date.parse(current.at) > Date.parse(synced.at))) {
    return { ...current, live: true };
  }
  return synced === null ? null : { ...synced, live: false };
}

export function useTodayFigure(
  device: Device | null,
  metric: LiveMetric,
  phone: StepsReading | null = null,
): TodaySteps | null {
  const today = dayKeyOf(useMinute());
  const profileId = device === null ? null : profileOf(device);
  const synced = useStoreSelector(
    (state) => syncedFigure(state, metric, today, profileId),
    sameReading,
  );
  const reported = device === null ? null : reportedFigure(device, metric);
  return todayStepsOf(synced, newer(phone, reported), today);
}

export function useTodaySteps(
  device: Device | null,
  phone: StepsReading | null = null,
): TodaySteps | null {
  return useTodayFigure(device, 'steps', phone);
}
