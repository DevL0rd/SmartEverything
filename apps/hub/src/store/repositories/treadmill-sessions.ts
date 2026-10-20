import {
  SESSION_SAMPLE,
  TREADMILL_SESSION,
  type SessionSample,
  type TreadmillSession,
} from '@smarteverything/domain';
import { z } from 'zod';
import { found, type StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';

const FIGURES = z.object(
  TREADMILL_SESSION.omit({
    id: true,
    deviceId: true,
    walkerProfileId: true,
    startedAt: true,
    endedAt: true,
    zoneOffsetSeconds: true,
    source: true,
  }).shape,
);

const STORED_SESSION = z
  .object({
    id: z.string(),
    device_id: z.string(),
    walker_profile_id: z.string().nullable(),
    started_at: z.string(),
    ended_at: z.string().nullable(),
    zone_offset_seconds: z.number().int(),
    source: z.string(),
    figures: SQL_JSON.pipe(FIGURES),
  })
  .transform((row) => ({
    ...row.figures,
    id: row.id,
    deviceId: row.device_id,
    walkerProfileId: row.walker_profile_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? row.started_at,
    zoneOffsetSeconds: row.zone_offset_seconds,
    source: row.source,
  }));

const STORED_SAMPLE = z
  .object({
    t_s: z.number(),
    speed_cmh: z.number(),
    distance_m: z.number(),
    steps: z.number().nullable(),
    incline_raw: z.number().nullable(),
    state: z.string(),
  })
  .transform((row) =>
    SESSION_SAMPLE.parse({
      t: row.t_s,
      kmh: row.speed_cmh / 100,
      distanceM: row.distance_m,
      steps: row.steps,
      incline: row.incline_raw,
      state: row.state,
    }),
  );

const STORED_OPEN = z.object({ id: z.string() });

const COLUMNS =
  'id, device_id, walker_profile_id, started_at, ended_at, zone_offset_seconds, source, figures';

function parsedSession(row: z.output<typeof STORED_SESSION>): TreadmillSession {
  return TREADMILL_SESSION.parse(row);
}

function figuresOf(session: TreadmillSession): string {
  return jsonText(FIGURES.parse(session));
}

export interface SessionPage {
  readonly deviceId: string;
  readonly walkerProfileId: string | null | undefined;
  readonly before: string | undefined;
  readonly limit: number;
}

export class TreadmillSessionsRepository {
  constructor(private readonly context: StoreContext) {}

  open(session: TreadmillSession): void {
    this.context.sql.run(
      'open the treadmill session',
      `insert into treadmill_sessions (${COLUMNS}) values ($id, $deviceId, $walker, $startedAt, null, $zone, $source, $figures)`,
      {
        id: session.id,
        deviceId: session.deviceId,
        walker: session.walkerProfileId,
        startedAt: session.startedAt,
        zone: session.zoneOffsetSeconds,
        source: session.source,
        figures: figuresOf(session),
      },
    );
  }

  save(session: TreadmillSession, finished: boolean): void {
    this.context.sql.run(
      'save the treadmill session',
      `update treadmill_sessions set figures = $figures, walker_profile_id = $walker,
         started_at = $startedAt, ended_at = $endedAt, source = $source where id = $id`,
      {
        id: session.id,
        figures: figuresOf(session),
        walker: session.walkerProfileId,
        startedAt: session.startedAt,
        endedAt: finished ? session.endedAt : null,
        source: session.source,
      },
    );
  }

  add(session: TreadmillSession): void {
    this.context.sql.run(
      'add the treadmill session',
      `insert into treadmill_sessions (${COLUMNS}) values ($id, $deviceId, $walker, $startedAt, $endedAt, $zone, $source, $figures)`,
      {
        id: session.id,
        deviceId: session.deviceId,
        walker: session.walkerProfileId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        zone: session.zoneOffsetSeconds,
        source: session.source,
        figures: figuresOf(session),
      },
    );
  }

  byId(id: string): TreadmillSession {
    return found(this.find(id), 'treadmill session', id);
  }

  find(id: string): TreadmillSession | undefined {
    const row = this.context.sql.get(
      STORED_SESSION,
      `select ${COLUMNS} from treadmill_sessions where id = $id`,
      { id },
    );
    return row === undefined ? undefined : parsedSession(row);
  }

  openIds(): string[] {
    return this.context.sql
      .all(STORED_OPEN, 'select id from treadmill_sessions where ended_at is null')
      .map((row) => row.id);
  }

  page(request: SessionPage): TreadmillSession[] {
    const walker = request.walkerProfileId;
    return this.context.sql
      .all(
        STORED_SESSION,
        `select ${COLUMNS} from treadmill_sessions
         where device_id = $deviceId and ended_at is not null
           and ($allWalkers = 1 or walker_profile_id is $walker)
           and ($before is null or started_at < $before)
         order by started_at desc limit $limit`,
        {
          deviceId: request.deviceId,
          allWalkers: walker === undefined ? 1 : 0,
          walker: walker ?? null,
          before: request.before ?? null,
          limit: request.limit,
        },
      )
      .map(parsedSession);
  }

  finished(deviceId: string, walkerProfileId: string | null | undefined): TreadmillSession[] {
    return this.context.sql
      .all(
        STORED_SESSION,
        `select ${COLUMNS} from treadmill_sessions
         where device_id = $deviceId and ended_at is not null
           and ($allWalkers = 1 or walker_profile_id is $walker)
         order by started_at`,
        {
          deviceId,
          allWalkers: walkerProfileId === undefined ? 1 : 0,
          walker: walkerProfileId ?? null,
        },
      )
      .map(parsedSession);
  }

  reassign(id: string, walkerProfileId: string | null): void {
    this.context.sql.run(
      'give the treadmill session another walker',
      'update treadmill_sessions set walker_profile_id = $walker where id = $id',
      { id, walker: walkerProfileId },
    );
  }

  remove(id: string): void {
    this.context.sql.run(
      'forget the treadmill session',
      'delete from treadmill_sessions where id = $id',
      {
        id,
      },
    );
  }

  appendSamples(sessionId: string, samples: readonly SessionSample[]): void {
    this.context.write(() => {
      for (const sample of samples) {
        this.context.sql.run(
          'record a treadmill sample',
          `insert or replace into treadmill_samples (session_id, t_s, speed_cmh, distance_m, steps, incline_raw, state)
           values ($sessionId, $t, $speed, $distance, $steps, $incline, $state)`,
          {
            sessionId,
            t: Math.round(sample.t),
            speed: Math.round(sample.kmh * 100),
            distance: Math.round(sample.distanceM),
            steps: sample.steps,
            incline: sample.incline,
            state: sample.state,
          },
        );
      }
    });
  }

  samples(sessionId: string): SessionSample[] {
    return this.context.sql.all(
      STORED_SAMPLE,
      `select t_s, speed_cmh, distance_m, steps, incline_raw, state from treadmill_samples
       where session_id = $sessionId order by t_s`,
      { sessionId },
    );
  }

  lastSampleSecond(sessionId: string): number | null {
    return (
      this.context.sql.get(
        z.object({ t_s: z.number().nullable() }),
        'select max(t_s) as t_s from treadmill_samples where session_id = $sessionId',
        { sessionId },
      )?.t_s ?? null
    );
  }

  distanceSince(deviceId: string, since: string | null): number {
    return (
      this.context.sql.get(
        z.object({ total: z.number().nullable() }),
        `select sum(json_extract(figures, '$.distanceM')) as total from treadmill_sessions
         where device_id = $deviceId and ended_at is not null and ($since is null or started_at >= $since)`,
        { deviceId, since },
      )?.total ?? 0
    );
  }
}
