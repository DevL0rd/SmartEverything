import {
  HISTORY_BUCKET,
  HISTORY_ROW,
  STATE_ROW,
  isSampledCapability,
  jsonEquals,
  type HistoryBucket,
  type HistoryRow,
  type JsonValue,
  type StateRow,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { found, moment, type StoreContext } from '../context';
import { jsonText } from '../sql';
import { DeviceMetricsRepository } from './device-metrics';
import { listFilter, type Filter } from './series-filter';

const STORED_STATE = storedRow(STATE_ROW, { json: ['value'] });
const STORED_HISTORY = storedRow(HISTORY_ROW, { json: ['value'] });
const STORED_BUCKET = storedRow(HISTORY_BUCKET, { json: ['last'] });

export interface StateWrite {
  readonly deviceId: string;
  readonly capability: string;
  readonly value: JsonValue;
  readonly observedAt: string;
}

interface SeriesQuery {
  readonly capabilities: readonly string[];
  readonly deviceIds?: readonly string[] | undefined;
  readonly from: string;
  readonly to?: string | undefined;
}

export interface HistoryQuery extends SeriesQuery {
  readonly order: 'asc' | 'desc';
  readonly limit: number;
}

export interface BucketQuery extends SeriesQuery {
  readonly to: string;
  readonly bucketSeconds: number;
}

function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

function bucketOrder(a: HistoryBucket, b: HistoryBucket): number {
  return (
    compareText(a.device_id, b.device_id) ||
    compareText(a.capability, b.capability) ||
    compareText(a.bucket_start, b.bucket_start)
  );
}

function seriesFilter(query: SeriesQuery): Filter {
  const filters = [
    listFilter('capability', 'capability', query.capabilities),
    ...(query.deviceIds === undefined ? [] : [listFilter('device_id', 'device', query.deviceIds)]),
    { text: 'observed_at >= $from', parameters: { from: moment(query.from) } },
    ...(query.to === undefined
      ? []
      : [{ text: 'observed_at < $to', parameters: { to: moment(query.to) } }]),
  ];
  return {
    text: filters.map((filter) => filter.text).join(' and '),
    parameters: filters.reduce<Record<string, SQLInputValue>>(
      (all, filter) => ({ ...all, ...filter.parameters }),
      {},
    ),
  };
}

const NUMERIC = "json_type(value) in ('integer', 'real')";

export class StateRepository {
  private readonly metrics: DeviceMetricsRepository;

  constructor(private readonly context: StoreContext) {
    this.metrics = new DeviceMetricsRepository(context);
  }

  list(): StateRow[] {
    return this.context.sql.all(
      STORED_STATE,
      'select device_id, capability, value, observed_at from device_state order by device_id, capability',
    );
  }

  write(rows: readonly StateWrite[]): void {
    this.context.write(() => {
      for (const row of rows) {
        this.writeOne(row);
      }
    });
  }

  history(query: HistoryQuery): HistoryRow[] {
    const filter = seriesFilter(query);
    const direction = query.order === 'asc' ? 'asc' : 'desc';
    return this.context.sql.all(
      STORED_HISTORY,
      `select id, device_id, capability, value, observed_at from state_history
       where ${filter.text} order by observed_at ${direction}, id ${direction} limit $limit`,
      { ...filter.parameters, limit: query.limit },
    );
  }

  buckets(query: BucketQuery): HistoryBucket[] {
    const sampled = query.capabilities.filter((capability) => isSampledCapability(capability));
    const recorded = query.capabilities.filter((capability) => !isSampledCapability(capability));
    return [
      ...(recorded.length === 0 ? [] : this.recordedBuckets({ ...query, capabilities: recorded })),
      ...this.metrics.buckets({ ...query, capabilities: sampled }),
    ].sort(bucketOrder);
  }

  private recordedBuckets(query: BucketQuery): HistoryBucket[] {
    const filter = seriesFilter(query);
    return this.context.sql.all(
      STORED_BUCKET,
      `with series as (
         select device_id, capability, value, observed_at, id,
                (cast(unixepoch(observed_at) as integer) / cast($seconds as integer)) * cast($seconds as integer) as bucket
         from state_history where ${filter.text}
       )
       select device_id, capability,
              strftime('%Y-%m-%dT%H:%M:%fZ', bucket, 'unixepoch') as bucket_start,
              count(*) as count,
              avg(case when ${NUMERIC} then cast(value as real) end) as average,
              min(case when ${NUMERIC} then cast(value as real) end) as minimum,
              max(case when ${NUMERIC} then cast(value as real) end) as maximum,
              (select latest.value from series latest
                where latest.device_id = series.device_id and latest.capability = series.capability
                  and latest.bucket = series.bucket
                order by latest.observed_at desc, latest.id desc limit 1) as last
       from series group by device_id, capability, bucket
       order by device_id, capability, bucket`,
      { ...filter.parameters, seconds: query.bucketSeconds },
    );
  }

  private writeOne(row: StateWrite): void {
    const observedAt = moment(row.observedAt);
    const before = this.context.sql.get(
      STORED_STATE,
      'select device_id, capability, value, observed_at from device_state where device_id = $deviceId and capability = $capability',
      { deviceId: row.deviceId, capability: row.capability },
    );
    const value = jsonText(row.value);
    this.context.sql.run(
      'save the device state',
      `insert into device_state (device_id, capability, value, observed_at)
       values ($deviceId, $capability, $value, $observedAt)
       on conflict (device_id, capability) do update set value = excluded.value, observed_at = excluded.observed_at`,
      { deviceId: row.deviceId, capability: row.capability, value, observedAt },
    );
    const after = {
      device_id: row.deviceId,
      capability: row.capability,
      value: row.value,
      observed_at: observedAt,
    };
    this.context.changed(
      'device_state',
      before === undefined ? 'INSERT' : 'UPDATE',
      after,
      before ?? null,
    );
    if (
      isSampledCapability(row.capability) ||
      (before !== undefined && jsonEquals(before.value, row.value))
    ) {
      return;
    }
    this.recordHistory(row, value, observedAt);
  }

  private recordHistory(row: StateWrite, value: string, observedAt: string): void {
    this.context.sql.run(
      'record the state history',
      `insert into state_history (device_id, capability, value, observed_at)
       values ($deviceId, $capability, $value, $observedAt)`,
      { deviceId: row.deviceId, capability: row.capability, value, observedAt },
    );
    const history = found(
      this.context.sql.get(
        STORED_HISTORY,
        'select id, device_id, capability, value, observed_at from state_history where id = last_insert_rowid()',
      ),
      'state history row',
      'just inserted',
    );
    this.context.changed('state_history', 'INSERT', history, null);
  }
}
