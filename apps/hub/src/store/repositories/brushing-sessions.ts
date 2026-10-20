import {
  BRUSHING_SESSION,
  BRUSH_HEAD_TYPES,
  SESSION_DETAILS,
  SESSION_PRESSURE,
  type BrushHeadType,
  type BrushingSession,
} from '@smarteverything/domain';
import { z } from 'zod';
import { found, type StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';

const STORED_SESSION = z
  .object({
    id: z.string(),
    device_id: z.string(),
    person_id: z.string().nullable(),
    handle_session_id: z.number().nullable(),
    started_at: z.string(),
    zone_offset_seconds: z.number().int(),
    duration_s: z.number(),
    routine_s: z.number(),
    mode: z.string().nullable(),
    intensity: z.string().nullable(),
    source: z.string(),
    complete: z.number(),
    pressure: z.string().nullable(),
    zones: SQL_JSON.pipe(z.array(z.number())),
    head_serial: z.string().nullable(),
    details: z.string().nullable(),
  })
  .transform((row) =>
    BRUSHING_SESSION.parse({
      id: row.id,
      deviceId: row.device_id,
      personId: row.person_id,
      handleSessionId: row.handle_session_id,
      startedAt: row.started_at,
      zoneOffsetSeconds: row.zone_offset_seconds,
      durationS: row.duration_s,
      routineS: row.routine_s,
      mode: row.mode,
      intensity: row.intensity,
      source: row.source,
      complete: row.complete === 1,
      pressure: row.pressure === null ? null : SESSION_PRESSURE.parse(JSON.parse(row.pressure)),
      zones: row.zones,
      headSerial: row.head_serial,
      details: row.details === null ? null : SESSION_DETAILS.parse(JSON.parse(row.details)),
    }),
  );

const STORED_HEAD = z
  .object({
    serial: z.string(),
    head_type: z.enum(BRUSH_HEAD_TYPES).nullable(),
    first_seen: z.string(),
    last_seen: z.string(),
    first_usage_s: z.number(),
    usage_s: z.number(),
    limit_s: z.number(),
  })
  .transform((row) => ({
    serial: row.serial,
    type: row.head_type,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    firstUsageS: row.first_usage_s,
    usageS: row.usage_s,
    limitS: row.limit_s,
  }));

export type StoredHead = z.output<typeof STORED_HEAD>;

const COLUMNS =
  'id, device_id, person_id, handle_session_id, started_at, zone_offset_seconds, duration_s, routine_s, mode, intensity, source, complete, pressure, zones, head_serial, details';

const HANDLE_IDS = z.object({ handle_session_id: z.number() });

function parametersOf(session: BrushingSession): Record<string, string | number | null> {
  return {
    id: session.id,
    person: session.personId,
    handleId: session.handleSessionId,
    startedAt: session.startedAt,
    zone: session.zoneOffsetSeconds,
    duration: session.durationS,
    routine: session.routineS,
    mode: session.mode,
    intensity: session.intensity,
    source: session.source,
    complete: session.complete ? 1 : 0,
    pressure: session.pressure === null ? null : jsonText(session.pressure),
    zones: jsonText(session.zones),
    head: session.headSerial,
    details: session.details === null ? null : jsonText(session.details),
  };
}

export interface BrushingPage {
  readonly deviceId: string;
  readonly personId: string | null | undefined;
  readonly before: string | undefined;
  readonly limit: number;
}

export class BrushingSessionsRepository {
  constructor(private readonly context: StoreContext) {}

  add(session: BrushingSession): void {
    this.context.sql.run(
      'add the brushing session',
      `insert into brushing_sessions (${COLUMNS}) values ($id, $deviceId, $person, $handleId, $startedAt, $zone, $duration, $routine, $mode, $intensity, $source, $complete, $pressure, $zones, $head, $details)`,
      { ...parametersOf(session), deviceId: session.deviceId },
    );
  }

  update(session: BrushingSession): void {
    this.context.sql.run(
      'update the brushing session',
      `update brushing_sessions set person_id = $person, handle_session_id = $handleId, started_at = $startedAt,
         zone_offset_seconds = $zone, duration_s = $duration, routine_s = $routine, mode = $mode,
         intensity = $intensity, source = $source, complete = $complete, pressure = $pressure,
         zones = $zones, head_serial = $head, details = $details where id = $id`,
      parametersOf(session),
    );
  }

  find(id: string): BrushingSession | undefined {
    return this.context.sql.get(
      STORED_SESSION,
      `select ${COLUMNS} from brushing_sessions where id = $id`,
      { id },
    );
  }

  byId(id: string): BrushingSession {
    return found(this.find(id), 'brushing session', id);
  }

  findByHandleId(deviceId: string, handleSessionId: number): BrushingSession | undefined {
    return this.context.sql.get(
      STORED_SESSION,
      `select ${COLUMNS} from brushing_sessions
       where device_id = $deviceId and handle_session_id = $handleSessionId
       order by started_at desc limit 1`,
      { deviceId, handleSessionId },
    );
  }

  near(deviceId: string, startedAt: string, withinSeconds: number): BrushingSession | undefined {
    const at = Date.parse(startedAt);
    return this.context.sql.get(
      STORED_SESSION,
      `select ${COLUMNS} from brushing_sessions
       where device_id = $deviceId and started_at >= $from and started_at <= $to
       order by abs(julianday(started_at) - julianday($startedAt)) limit 1`,
      {
        deviceId,
        startedAt,
        from: new Date(at - withinSeconds * 1000).toISOString(),
        to: new Date(at + withinSeconds * 1000).toISOString(),
      },
    );
  }

  handleIds(deviceId: string): number[] {
    return this.context.sql
      .all(
        HANDLE_IDS,
        `select distinct handle_session_id from brushing_sessions
         where device_id = $deviceId and handle_session_id is not null and source = 'retained'`,
        { deviceId },
      )
      .map((row) => row.handle_session_id);
  }

  page(request: BrushingPage): BrushingSession[] {
    const person = request.personId;
    return this.context.sql.all(
      STORED_SESSION,
      `select ${COLUMNS} from brushing_sessions
       where device_id = $deviceId
         and ($everyone = 1 or person_id is $person)
         and ($before is null or started_at < $before)
       order by started_at desc limit $limit`,
      {
        deviceId: request.deviceId,
        everyone: person === undefined ? 1 : 0,
        person: person ?? null,
        before: request.before ?? null,
        limit: request.limit,
      },
    );
  }

  all(deviceId: string, personId: string | null | undefined): BrushingSession[] {
    return this.context.sql.all(
      STORED_SESSION,
      `select ${COLUMNS} from brushing_sessions
       where device_id = $deviceId and ($everyone = 1 or person_id is $person)
       order by started_at`,
      { deviceId, everyone: personId === undefined ? 1 : 0, person: personId ?? null },
    );
  }

  countHidden(deviceId: string, personId: string): number {
    return (
      this.context.sql.get(
        z.object({ total: z.number() }),
        `select count(*) as total from brushing_sessions
         where device_id = $deviceId and person_id is not $person`,
        { deviceId, person: personId },
      )?.total ?? 0
    );
  }

  reassign(id: string, personId: string | null): void {
    this.context.sql.run(
      'give the brushing session to another person',
      'update brushing_sessions set person_id = $person where id = $id',
      { id, person: personId },
    );
  }

  remove(id: string): void {
    this.context.sql.run(
      'forget the brushing session',
      'delete from brushing_sessions where id = $id',
      {
        id,
      },
    );
  }

  saveHead(deviceId: string, head: StoredHeadWrite): void {
    this.context.sql.run(
      'remember the brush head',
      `insert into brush_heads (device_id, serial, head_type, first_seen, last_seen, first_usage_s, usage_s, limit_s)
       values ($deviceId, $serial, $type, $at, $at, $usage, $usage, $limit)
       on conflict (device_id, serial) do update set
         head_type = coalesce(excluded.head_type, head_type), last_seen = excluded.last_seen,
         usage_s = excluded.usage_s, limit_s = excluded.limit_s`,
      {
        deviceId,
        serial: head.serial,
        type: head.type,
        at: head.at,
        usage: head.usageS,
        limit: head.limitS,
      },
    );
  }

  heads(deviceId: string): StoredHead[] {
    return this.context.sql.all(
      STORED_HEAD,
      `select serial, head_type, first_seen, last_seen, first_usage_s, usage_s, limit_s
       from brush_heads where device_id = $deviceId order by first_seen`,
      { deviceId },
    );
  }
}

export interface StoredHeadWrite {
  readonly serial: string;
  readonly type: BrushHeadType | null;
  readonly at: string;
  readonly usageS: number;
  readonly limitS: number;
}
