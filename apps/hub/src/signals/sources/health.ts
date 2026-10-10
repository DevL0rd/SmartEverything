import {
  BODY_READING_FIELDS,
  type BodyReadingRow,
  type RowChange,
  type SignalInput,
} from '@smarteverything/domain';
import { signalAt, type FeedContext } from './feed-context';

function todaySignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  if (change.table !== 'health_daily' || change.record === null) {
    return [];
  }
  const { record, oldRecord } = change;
  if (record.profile_id === null || record.day !== context.today()) {
    return [];
  }
  return [
    signalAt(context, {
      source: 'health',
      kind: 'today',
      subject: record.profile_id,
      field: record.metric,
      value: record.value,
      previous: oldRecord?.value ?? null,
      profileId: record.profile_id,
      data: { day: record.day },
    }),
  ];
}

function loggedSignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  if (change.table !== 'health_entries' || change.record === null || change.oldRecord !== null) {
    return [];
  }
  const { record } = change;
  return [
    signalAt(context, {
      source: 'health',
      kind: 'logged',
      subject: record.profile_id,
      field: record.record_type,
      value: true,
      profileId: record.profile_id,
      data: { entryId: record.id },
    }),
  ];
}

function sleepEndedSignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  if (change.table !== 'health_daily' || change.record === null) {
    return [];
  }
  const { record, oldRecord } = change;
  if (record.profile_id === null || record.metric !== 'sleep' || record.day !== context.today()) {
    return [];
  }
  if (record.value <= (oldRecord?.value ?? 0)) {
    return [];
  }
  const endedAt = context.recentSleepEnd(record.profile_id);
  if (endedAt === null) {
    return [];
  }
  return [
    signalAt(context, {
      source: 'health',
      kind: 'sleep_ended',
      subject: record.profile_id,
      field: null,
      value: endedAt,
      profileId: record.profile_id,
      data: { endedAt, day: record.day, minutes: record.value },
    }),
  ];
}

function readingValues(record: BodyReadingRow): readonly (readonly [string, number])[] {
  const values: Readonly<Record<string, number | null>> = {
    weight_kg: record.weight_kg,
    heart_rate: record.heart_rate,
    bmi: record.bmi,
  };
  return BODY_READING_FIELDS.flatMap(({ field }) => {
    const value = values[field];
    return value === null || value === undefined ? [] : [[field, value] as const];
  });
}

function readingSignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  if (change.table !== 'body_readings' || change.record === null) {
    return [];
  }
  const { record, oldRecord } = change;
  const profileId = record.profile_id;
  if (profileId === null || oldRecord?.profile_id === profileId) {
    return [];
  }
  return readingValues(record).map(([field, value]) =>
    signalAt(context, {
      source: 'health',
      kind: 'body_reading',
      subject: profileId,
      field,
      value,
      profileId,
      data: { readingId: record.id, deviceId: record.device_id },
    }),
  );
}

export function healthSignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  return [
    ...todaySignals(change, context),
    ...loggedSignals(change, context),
    ...readingSignals(change, context),
    ...sleepEndedSignals(change, context),
  ];
}
