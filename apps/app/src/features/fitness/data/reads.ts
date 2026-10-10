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
): Promise<DailyFigure[]> {
  return api().call(E.readHealthDaily, {
    query: { from: firstDay, to: lastDay, metrics: [...metrics] },
  });
}

export function readRecords(
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

export interface BestDay {
  readonly day: string;
  readonly value: number;
}

export function readBestDay(metric: HealthMetric, lowest: boolean): Promise<BestDay | null> {
  return api().call(E.readBestDay, { query: { metric, lowest } });
}

export async function readRecord(recordId: string): Promise<HealthRecord | null> {
  try {
    return await api().call(E.readHealthRecord, { params: { recordId } });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'not_found') {
      return null;
    }
    throw error;
  }
}

export function readSightings(since: number): Promise<SourceSighting[]> {
  return api().call(E.readHealthSightings, { query: { since: new Date(since).toISOString() } });
}
