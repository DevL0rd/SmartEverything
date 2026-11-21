import {
  API_ENDPOINTS as E,
  ApiError,
  type HealthMetric,
  type HealthRecord,
  type HealthRecordType,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import type { DailyFigure } from '../model/points';
import type { SourceSighting } from '../model/sources';

export function readDailyFigures(
  firstDay: string,
  lastDay: string,
  metrics: readonly HealthMetric[],
  signal: AbortSignal,
): Promise<DailyFigure[]> {
  return api().call(
    E.readHealthDaily,
    { query: { from: firstDay, to: lastDay, metrics: [...metrics] } },
    { signal },
  );
}

export function readRecords(
  types: readonly HealthRecordType[],
  from: number,
  to: number,
  signal: AbortSignal,
): Promise<HealthRecord[]> {
  return api().call(
    E.readHealthRecords,
    {
      query: {
        types: [...types],
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
      },
    },
    { signal },
  );
}

export interface BestDay {
  readonly day: string;
  readonly value: number;
}

export function readBestDay(
  metric: HealthMetric,
  lowest: boolean,
  signal: AbortSignal,
): Promise<BestDay | null> {
  return api().call(E.readBestDay, { query: { metric, lowest } }, { signal });
}

export async function readRecord(
  recordId: string,
  signal: AbortSignal,
): Promise<HealthRecord | null> {
  try {
    return await api().call(E.readHealthRecord, { params: { recordId } }, { signal });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'not_found') {
      return null;
    }
    throw error;
  }
}

export function readSightings(since: number, signal: AbortSignal): Promise<SourceSighting[]> {
  return api().call(
    E.readHealthSightings,
    { query: { since: new Date(since).toISOString() } },
    { signal },
  );
}
