import {
  API_ENDPOINTS as E,
  type HealthMetric,
  type HealthRecord,
  type HealthRecordType,
} from '@smarteverything/domain';
import { api } from '../../api/transport';
import type { ChartPoint } from '../../components/charts';
import { DAY_MS, startOfDayKey } from '../../format/time';
import { HEALTH_PREFIX } from '../../queries/keys';
import { useScreenQuery } from '../../queries/use-screen-query';
import { useDayKey, useMinute } from '../../store/clock';
import type { Device, StoreState } from '../../store/state';
import { useStoreSelector } from '../../store/store-context';
import { latestDaily } from './daily-index';
import { heartPointsOf } from './watch-heart';
import { lastNightOf, NIGHT_WINDOW_MS, type LastNight } from './watch-sleep';

function readRecords(
  types: readonly HealthRecordType[],
  from: number,
  to: number,
): Promise<HealthRecord[]> {
  return api().call(E.readHealthRecords, {
    query: {
      types: [...types],
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    },
  });
}

export function useHeartToday(enabled: boolean): readonly ChartPoint[] | undefined {
  const day = useDayKey();
  const from = startOfDayKey(day);
  const to = from + DAY_MS;
  return useScreenQuery({
    queryKey: [...HEALTH_PREFIX, 'watch-heart', from, to],
    queryFn: () => readRecords(['HeartRate'], from, to),
    select: heartPointsOf,
    enabled,
  }).data;
}

export function useWatchNight(): LastNight | null {
  const now = useMinute();
  const day = useDayKey();
  const to = startOfDayKey(day) + DAY_MS;
  const records = useScreenQuery({
    queryKey: [...HEALTH_PREFIX, 'watch-sleep', to],
    queryFn: () => readRecords(['SleepSession'], to - DAY_MS - NIGHT_WINDOW_MS, to),
  }).data;
  return records === undefined ? null : lastNightOf(records, now);
}

export interface DayFacts {
  readonly spo2: number | null;
  readonly stress: number | null;
  readonly resting: number | null;
  readonly activeMinutes: number | null;
}

const NONE: DayFacts = { spo2: null, stress: null, resting: null, activeMinutes: null };

function profileOf(device: Device): string | null {
  const profile = device.details['profileId'];
  return typeof profile === 'string' ? profile : null;
}

function todayOf(
  state: StoreState,
  metric: HealthMetric,
  profileId: string | null,
  today: string,
): number | null {
  const row = latestDaily(state, metric, profileId);
  return row?.day === today ? row.value : null;
}

function sameFacts(left: DayFacts, right: DayFacts): boolean {
  return (
    left.spo2 === right.spo2 &&
    left.stress === right.stress &&
    left.resting === right.resting &&
    left.activeMinutes === right.activeMinutes
  );
}

export function useDayFacts(device: Device): DayFacts {
  const today = useDayKey();
  const profileId = profileOf(device);
  return useStoreSelector(
    (state) =>
      profileId === null
        ? NONE
        : {
            spo2: todayOf(state, 'oxygen_saturation', profileId, today),
            stress: todayOf(state, 'stress_average', profileId, today),
            resting: latestDaily(state, 'resting_heart_rate', profileId)?.value ?? null,
            activeMinutes: todayOf(state, 'exercise', profileId, today),
          },
    sameFacts,
    [profileId, today],
  );
}
