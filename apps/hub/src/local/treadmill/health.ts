import {
  TREADMILL_EXERCISE_CODE,
  climbOf,
  type InclineScale,
  TREADMILL_SOURCE_APP,
  type HealthRecord,
  type SessionSample,
  type TreadmillSession,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { entrySettingsOf } from './config';

const SPEED_SAMPLE_SECONDS = 10;

const CADENCE_WINDOW_SECONDS = 30;

const MS_PER_KMH = 3.6;

const DAY_SECONDS = 86_400;

interface DayPart {
  readonly start: number;
  readonly end: number;
}

function dayParts(session: TreadmillSession): DayPart[] {
  const start = Date.parse(session.startedAt);
  const end = Math.max(Date.parse(session.endedAt), start + 1000);
  const offset = session.zoneOffsetSeconds * 1000;
  const parts: DayPart[] = [];
  let cursor = start;
  while (cursor < end) {
    const nextMidnight =
      Math.floor((cursor + offset) / (DAY_SECONDS * 1000) + 1) * DAY_SECONDS * 1000 - offset;
    const stop = Math.min(nextMidnight, end);
    parts.push({ start: cursor, end: stop });
    cursor = stop;
  }
  return parts;
}

function recordId(session: TreadmillSession, type: string, part: DayPart): string {
  return `treadmill:${session.deviceId}:${session.id}:${type}:${String(Math.floor(part.start / 1000))}`;
}

function titleOf(session: TreadmillSession): string {
  switch (session.kind) {
    case 'walk':
      return 'Treadmill walk';
    case 'jog':
      return 'Treadmill jog';
    case 'run':
      return 'Treadmill run';
    case 'intervals':
      return 'Treadmill intervals';
  }
}

function envelope(
  session: TreadmillSession,
  type: string,
  part: DayPart,
): {
  recordId: string;
  startTime: string;
  endTime: string;
  zoneOffsetSeconds: number;
  sourceApp: string;
  lastModified: string;
} {
  return {
    recordId: recordId(session, type, part),
    startTime: new Date(part.start).toISOString(),
    endTime: new Date(part.end).toISOString(),
    zoneOffsetSeconds: session.zoneOffsetSeconds,
    sourceApp: TREADMILL_SOURCE_APP,
    lastModified: session.endedAt,
  };
}

function inPart(sample: SessionSample, session: TreadmillSession, part: DayPart): boolean {
  const at = Date.parse(session.startedAt) + sample.t * 1000;
  return at >= part.start && at < part.end;
}

function speedRecord(
  session: TreadmillSession,
  samples: readonly SessionSample[],
  part: DayPart,
): HealthRecord[] {
  const picked = samples.filter(
    (sample) =>
      inPart(sample, session, part) &&
      sample.state === 'running' &&
      Math.round(sample.t) % SPEED_SAMPLE_SECONDS === 0,
  );
  if (picked.length === 0) {
    return [];
  }
  return [
    {
      ...envelope(session, 'Speed', part),
      type: 'Speed',
      data: {
        samples: picked.map((sample) => ({
          time: new Date(Date.parse(session.startedAt) + sample.t * 1000).toISOString(),
          metersPerSecond: sample.kmh / MS_PER_KMH,
        })),
      },
    },
  ];
}

function cadenceRecord(
  session: TreadmillSession,
  samples: readonly SessionSample[],
  part: DayPart,
): HealthRecord[] {
  const inside = samples.filter((sample) => inPart(sample, session, part) && sample.steps !== null);
  const points: { time: string; rate: number }[] = [];
  let anchor: SessionSample | undefined;
  for (const sample of inside) {
    anchor ??= sample;
    if (
      sample.t - anchor.t >= CADENCE_WINDOW_SECONDS &&
      sample.steps !== null &&
      anchor.steps !== null
    ) {
      points.push({
        time: new Date(Date.parse(session.startedAt) + sample.t * 1000).toISOString(),
        rate: ((sample.steps - anchor.steps) / (sample.t - anchor.t)) * 60,
      });
      anchor = sample;
    }
  }
  return points.length === 0
    ? []
    : [
        {
          ...envelope(session, 'StepsCadence', part),
          type: 'StepsCadence',
          data: { samples: points },
        },
      ];
}

function elevationRecord(
  session: TreadmillSession,
  samples: readonly SessionSample[],
  part: DayPart,
  scale: InclineScale,
): HealthRecord[] {
  const meters = climbOf(
    samples.filter((sample) => inPart(sample, session, part)),
    scale,
  );
  return meters > 0
    ? [{ ...envelope(session, 'ElevationGained', part), type: 'ElevationGained', data: { meters } }]
    : [];
}

function healthRecordsOf(
  session: TreadmillSession,
  samples: readonly SessionSample[],
  scale: InclineScale,
): HealthRecord[] {
  return dayParts(session).flatMap((part): HealthRecord[] => [
    {
      ...envelope(session, 'ExerciseSession', part),
      type: 'ExerciseSession',
      data: {
        exerciseType: TREADMILL_EXERCISE_CODE,
        title: titleOf(session),
        notes: null,
        plannedExerciseSessionId: null,
        segments: [],
        laps: [],
        route: { status: 'absent' },
      },
    },
    ...speedRecord(session, samples, part),
    ...cadenceRecord(session, samples, part),
    ...(scale === 'unconfirmed' ? [] : elevationRecord(session, samples, part, scale)),
  ]);
}

export class TreadmillHealth {
  constructor(
    private readonly store: Pick<
      Store,
      'health' | 'treadmillSessions' | 'write' | 'devices' | 'localDevices'
    >,
  ) {}

  private scaleOf(session: TreadmillSession): InclineScale {
    const device = this.store.devices.byId(session.deviceId);
    const entry = this.store.localDevices.byExternalId(device.external_id);
    return entrySettingsOf(entry).inclineScale;
  }

  save(session: TreadmillSession): void {
    if (session.walkerProfileId === null) {
      return;
    }
    const walker = session.walkerProfileId;
    const records = healthRecordsOf(
      session,
      this.store.treadmillSessions.samples(session.id),
      this.scaleOf(session),
    );
    this.store.health.replaceOwn({ profileId: walker, previous: walker, records, removed: [] });
  }

  move(session: TreadmillSession, from: string | null): void {
    const samples = this.store.treadmillSessions.samples(session.id);
    const scale = this.scaleOf(session);
    const ids = healthRecordsOf({ ...session, walkerProfileId: from }, samples, 'percent').map(
      (record) => record.recordId,
    );
    this.store.write(() => {
      this.store.health.replaceOwn({
        profileId: session.walkerProfileId,
        previous: from,
        records: session.walkerProfileId === null ? [] : healthRecordsOf(session, samples, scale),
        removed: ids,
      });
    });
  }

  forget(session: TreadmillSession): void {
    if (session.walkerProfileId === null) {
      return;
    }
    const ids = healthRecordsOf(
      session,
      this.store.treadmillSessions.samples(session.id),
      'percent',
    ).map((record) => record.recordId);
    this.store.health.replaceOwn({
      profileId: null,
      previous: session.walkerProfileId,
      records: [],
      removed: ids,
    });
  }
}
