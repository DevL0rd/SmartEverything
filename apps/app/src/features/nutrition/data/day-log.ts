import { type UseQueryResult } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  isOwnSource,
  type HealthEntryRow,
  type HealthRecord,
} from '@smarteverything/domain';
import { readEntries } from '../../../api/nutrition';
import { api } from '../../../api/transport';
import { HEALTH_PREFIX } from '../../../queries/keys';
import { entriesKey } from '../../../queries/health-entries';
import { endOfDayKey, startOfDayKey } from '../../../format/time';
import { useScreenQuery } from '../../../queries/use-screen-query';

export const LOGGED_TYPES = ['Nutrition', 'Hydration'] as const;

type OtherRecord = Extract<HealthRecord, { type: 'Nutrition' | 'Hydration' }>;

export function useDayEntries(day: string): UseQueryResult<HealthEntryRow[]> {
  const from = startOfDayKey(day);
  const to = endOfDayKey(day);
  return useScreenQuery({
    queryKey: entriesKey(from, to, LOGGED_TYPES.join(',')),
    queryFn: () => readEntries(from, to, LOGGED_TYPES),
  });
}

function isLogged(record: HealthRecord): record is OtherRecord {
  return record.type === 'Nutrition' || record.type === 'Hydration';
}

async function readDayRecords(from: number, to: number): Promise<OtherRecord[]> {
  const records = await api().call(E.readHealthRecords, {
    query: {
      types: [...LOGGED_TYPES],
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    },
  });
  return records.filter(isLogged).filter((record) => {
    const start = Date.parse(record.startTime);
    return record.type !== 'Hydration' || (start >= from && start < to);
  });
}

function dayRecordsQuery(day: string): {
  readonly queryKey: readonly (string | number)[];
  readonly queryFn: () => Promise<OtherRecord[]>;
} {
  const from = startOfDayKey(day);
  const to = endOfDayKey(day);
  return {
    queryKey: [...HEALTH_PREFIX, 'nutrition-records', from, to],
    queryFn: () => readDayRecords(from, to),
  };
}

export function useDayRecords(day: string): UseQueryResult<OtherRecord[]> {
  return useScreenQuery(dayRecordsQuery(day));
}

export function useOtherApps(day: string): UseQueryResult<OtherRecord[]> {
  return useScreenQuery({
    ...dayRecordsQuery(day),
    select: (records) => records.filter((record) => !isOwnSource(record.sourceApp)),
  });
}

export type { OtherRecord };
