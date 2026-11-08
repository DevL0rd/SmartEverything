import {
  VACUUM_CLEAN,
  VACUUM_CLEAN_SUMMARY,
  VACUUM_TRAIL_RUN,
  type VacuumClean,
  type VacuumCleanSummary,
} from '@smarteverything/domain';
import { z } from 'zod';
import { moment, type StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';

const SUMMARY_COLUMNS =
  'id, started_at, ended_at, seconds, area_m2, scope, mode, rooms, outcome, battery_start, battery_end';

const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, map_index, zones, trail`;

const STORED_SUMMARY = z.object({
  id: z.string(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  seconds: z.number(),
  area_m2: z.number(),
  scope: z.string().nullable(),
  mode: z.string().nullable(),
  rooms: SQL_JSON,
  outcome: z.string().nullable(),
  battery_start: z.number().nullable(),
  battery_end: z.number().nullable(),
});

const STORED_CLEAN = STORED_SUMMARY.extend({
  map_index: z.number().int().nullable(),
  zones: SQL_JSON,
  trail: SQL_JSON,
});

function summaryOf(row: z.output<typeof STORED_SUMMARY>): VacuumCleanSummary {
  return VACUUM_CLEAN_SUMMARY.parse({
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    seconds: row.seconds,
    areaM2: row.area_m2,
    scope: row.scope,
    mode: row.mode,
    rooms: row.rooms,
    outcome: row.outcome,
    batteryStart: row.battery_start,
    batteryEnd: row.battery_end,
  });
}

function cleanOf(row: z.output<typeof STORED_CLEAN>): VacuumClean {
  return VACUUM_CLEAN.parse({
    ...summaryOf(row),
    mapIndex: row.map_index,
    zones: row.zones,
    trail: z.array(VACUUM_TRAIL_RUN).parse(row.trail),
  });
}

const SAVE = `insert into vacuum_cleans (
    device_id, id, started_at, ended_at, seconds, area_m2, scope, mode, rooms, outcome,
    battery_start, battery_end, map_index, zones, trail
  ) values (
    $deviceId, $id, $startedAt, $endedAt, $seconds, $areaM2, $scope, $mode, $rooms, $outcome,
    $batteryStart, $batteryEnd, $mapIndex, $zones, $trail
  ) on conflict (device_id, id) do update set
    started_at = excluded.started_at, ended_at = excluded.ended_at, seconds = excluded.seconds,
    area_m2 = excluded.area_m2, scope = excluded.scope, mode = excluded.mode,
    rooms = excluded.rooms, outcome = excluded.outcome, battery_start = excluded.battery_start,
    battery_end = excluded.battery_end, map_index = excluded.map_index,
    zones = excluded.zones, trail = excluded.trail`;

export interface VacuumCleanQuery {
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
}

export class VacuumCleansRepository {
  constructor(private readonly context: StoreContext) {}

  save(deviceId: string, clean: VacuumClean): void {
    this.context.write(() => {
      this.context.sql.run('save the vacuum clean', SAVE, {
        deviceId,
        id: clean.id,
        startedAt: moment(clean.startedAt),
        endedAt: clean.endedAt === null ? null : moment(clean.endedAt),
        seconds: clean.seconds,
        areaM2: clean.areaM2,
        scope: clean.scope,
        mode: clean.mode,
        rooms: jsonText(clean.rooms),
        outcome: clean.outcome,
        batteryStart: clean.batteryStart,
        batteryEnd: clean.batteryEnd,
        mapIndex: clean.mapIndex,
        zones: jsonText(clean.zones),
        trail: jsonText(clean.trail),
      });
    });
  }

  rename(deviceId: string, from: string, to: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'rename the vacuum clean',
        'update vacuum_cleans set id = $to where device_id = $deviceId and id = $from',
        { deviceId, from, to },
      );
    });
  }

  get(deviceId: string, id: string): VacuumClean | undefined {
    const row = this.context.sql.get(
      STORED_CLEAN,
      `select ${DETAIL_COLUMNS} from vacuum_cleans where device_id = $deviceId and id = $id`,
      { deviceId, id },
    );
    return row === undefined ? undefined : cleanOf(row);
  }

  open(deviceId: string): VacuumClean | undefined {
    const row = this.context.sql.get(
      STORED_CLEAN,
      `select ${DETAIL_COLUMNS} from vacuum_cleans
       where device_id = $deviceId and ended_at is null
       order by started_at desc limit 1`,
      { deviceId },
    );
    return row === undefined ? undefined : cleanOf(row);
  }

  list(deviceId: string, query: VacuumCleanQuery = {}): VacuumCleanSummary[] {
    return this.context.sql
      .all(
        STORED_SUMMARY,
        `select ${SUMMARY_COLUMNS} from vacuum_cleans
         where device_id = $deviceId
           and ($from is null or started_at >= $from)
           and ($to is null or started_at < $to)
         order by started_at desc limit $limit`,
        {
          deviceId,
          from: query.from === undefined ? null : moment(query.from),
          to: query.to === undefined ? null : moment(query.to),
          limit: query.limit ?? -1,
        },
      )
      .map(summaryOf);
  }
}
