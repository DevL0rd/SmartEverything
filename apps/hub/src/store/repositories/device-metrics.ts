import {
  HISTORY_BUCKET,
  METRIC_POINT,
  type HistoryBucket,
  type MetricPoint,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { allOf, inList, type SqlFilter } from '../sql';

export type StoredResolution = 'minute' | 'hour';

export interface MetricRowInsert {
  readonly deviceId: string;
  readonly capability: string;
  readonly bucketStart: string;
  readonly average: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly count: number;
}

export interface MetricBucketQuery {
  readonly capabilities: readonly string[];
  readonly deviceIds?: readonly string[] | undefined;
  readonly from: string;
  readonly to: string;
  readonly bucketSeconds: number;
}

const STORED_BUCKET = storedRow(HISTORY_BUCKET, { json: ['last'] });

const HOUR_SECONDS = 3600;

function bucketFilter(query: MetricBucketQuery): SqlFilter {
  return allOf([
    inList('capability', 'capabilities', query.capabilities),
    ...(query.deviceIds === undefined ? [] : [inList('device_id', 'devices', query.deviceIds)]),
    {
      text: 'resolution = $resolution and bucket_start >= $from and bucket_start < $to',
      parameters: {},
    },
  ]);
}

export class DeviceMetricsRepository {
  constructor(private readonly context: StoreContext) {}

  saveMinutes(rows: readonly MetricRowInsert[]): void {
    this.context.write(() => {
      for (const row of rows) {
        this.context.sql.run(
          'save a minute of device metrics',
          `insert into device_metrics (device_id, capability, resolution, bucket_start, average, minimum, maximum, count)
           values ($deviceId, $capability, 'minute', $bucketStart, $average, $minimum, $maximum, $count)
           on conflict (device_id, capability, resolution, bucket_start) do update set
             average = excluded.average, minimum = excluded.minimum,
             maximum = excluded.maximum, count = excluded.count`,
          { ...row },
        );
      }
    });
  }

  rollHours(from: string, to: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'roll device metrics into hours',
        `insert into device_metrics (device_id, capability, resolution, bucket_start, average, minimum, maximum, count)
         select device_id, capability, 'hour', strftime('%Y-%m-%dT%H:00:00.000Z', bucket_start),
                sum(average * count) / sum(count), min(minimum), max(maximum), sum(count)
         from device_metrics
         where resolution = 'minute' and bucket_start >= $from and bucket_start < $to
         group by device_id, capability, strftime('%Y-%m-%dT%H:00:00.000Z', bucket_start)
         on conflict (device_id, capability, resolution, bucket_start) do update set
           average = excluded.average, minimum = excluded.minimum,
           maximum = excluded.maximum, count = excluded.count`,
        { from, to },
      );
    });
  }

  prune(resolution: StoredResolution, before: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'drop old device metrics',
        'delete from device_metrics where resolution = $resolution and bucket_start < $before',
        { resolution, before },
      );
    });
  }

  series(
    deviceId: string,
    capability: string,
    resolution: StoredResolution,
    from: string,
  ): MetricPoint[] {
    return this.context.sql.all(
      METRIC_POINT,
      `select bucket_start as at, average as value, minimum, maximum from device_metrics
       where device_id = $deviceId and capability = $capability and resolution = $resolution
         and bucket_start >= $from
       order by bucket_start`,
      { deviceId, capability, resolution, from },
    );
  }

  buckets(query: MetricBucketQuery): HistoryBucket[] {
    if (query.capabilities.length === 0) {
      return [];
    }
    const filter = bucketFilter(query);
    return this.context.sql.all(
      STORED_BUCKET,
      `with series as (
         select device_id, capability, bucket_start, average, minimum, maximum, count,
                (cast(unixepoch(bucket_start) as integer) / cast($seconds as integer)) * cast($seconds as integer) as bucket
         from device_metrics where ${filter.text}
       )
       select device_id, capability,
              strftime('%Y-%m-%dT%H:%M:%fZ', bucket, 'unixepoch') as bucket_start,
              sum(count) as count,
              sum(average * count) / sum(count) as average,
              min(minimum) as minimum,
              max(maximum) as maximum,
              (select json(latest.average) from series latest
                where latest.device_id = series.device_id and latest.capability = series.capability
                  and latest.bucket = series.bucket
                order by latest.bucket_start desc limit 1) as last
       from series group by device_id, capability, bucket
       order by device_id, capability, bucket`,
      {
        ...filter.parameters,
        resolution: query.bucketSeconds >= HOUR_SECONDS ? 'hour' : 'minute',
        from: new Date(query.from).toISOString(),
        to: new Date(query.to).toISOString(),
        seconds: query.bucketSeconds,
      },
    );
  }
}
