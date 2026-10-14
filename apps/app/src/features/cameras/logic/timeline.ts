import {
  localClock,
  cameraDetectionOf,
  type CameraDetection,
  zonedInstant,
  type CalendarDate,
  type EventKind,
} from '@smarteverything/domain';

export const CAMERA_EVENT_KINDS: readonly EventKind[] = [
  'doorbell',
  'call',
  'person',
  'pet',
  'motion',
  'sound',
  'alarm',
  'activity',
];

export type TimelineKind = EventKind | 'recording';

const MINUTES_A_DAY = 1440;

const DAY_MS = 86_400_000;

export interface TimelineEvent {
  readonly id: string;
  readonly device_id: string | null;
  readonly kind: EventKind;
  readonly occurred_at: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface TimelineRecording {
  readonly id: string;
  readonly device_id: string;
  readonly event_id: string | null;
  readonly kind: 'snapshot' | 'clip';
  readonly started_at: string;
}

export interface TimelineFilter {
  readonly deviceIds: readonly string[] | null;
  readonly kinds: readonly TimelineKind[] | null;
  readonly soundDetections?: readonly CameraDetection[] | null;
}

export const NO_FILTER: TimelineFilter = { deviceIds: null, kinds: null, soundDetections: null };

export function filterCount(filter: TimelineFilter): number {
  return (
    (filter.deviceIds === null ? 0 : 1) +
    (filter.kinds === null ? 0 : 1) +
    (filter.soundDetections === undefined || filter.soundDetections === null ? 0 : 1)
  );
}

export interface TimelineItem<E extends TimelineEvent, R extends TimelineRecording> {
  readonly id: string;
  readonly at: string;
  readonly kind: TimelineKind;
  readonly deviceId: string;
  readonly event: E | null;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly snapshot: R | null;
  readonly clip: R | null;
}

export interface DayBounds {
  readonly start: string;
  readonly end: string;
}

export function dayOf(instant: string, timeZone: string): CalendarDate {
  const clock = localClock(new Date(instant), timeZone);
  return { year: clock.year, month: clock.month, day: clock.day };
}

export function shiftDay(day: CalendarDate, by: number): CalendarDate {
  const moved = new Date(Date.UTC(day.year, day.month - 1, day.day) + by * DAY_MS);
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  };
}

export function sameDay(left: CalendarDate, right: CalendarDate): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

export function dayBounds(day: CalendarDate, timeZone: string): DayBounds {
  return {
    start: zonedInstant(day, 0, timeZone).toISOString(),
    end: zonedInstant(shiftDay(day, 1), 0, timeZone).toISOString(),
  };
}

export function dayFraction(instant: string, timeZone: string): number {
  const date = new Date(instant);
  const clock = localClock(date, timeZone);
  return (clock.minuteOfDay + date.getUTCSeconds() / 60) / MINUTES_A_DAY;
}

function shown(filter: TimelineFilter, deviceId: string, kind: TimelineKind): boolean {
  return (
    (filter.deviceIds === null || filter.deviceIds.includes(deviceId)) &&
    (filter.kinds === null || filter.kinds.includes(kind))
  );
}

function soundShown(filter: TimelineFilter, event: TimelineEvent): boolean {
  const detections = filter.soundDetections;
  if (event.kind !== 'sound' || detections === undefined || detections === null) {
    return true;
  }
  const detection = cameraDetectionOf(event.kind, event.details ?? {});
  return detection !== null && detections.includes(detection);
}

function byNewest(left: { readonly at: string }, right: { readonly at: string }): number {
  return right.at.localeCompare(left.at);
}

function recordingsOf<R extends TimelineRecording>(
  recordings: readonly R[],
  eventId: string,
): { readonly snapshot: R | null; readonly clip: R | null } {
  const own = recordings.filter((recording) => recording.event_id === eventId);
  return {
    snapshot: own.find((recording) => recording.kind === 'snapshot') ?? null,
    clip: own.find((recording) => recording.kind === 'clip') ?? null,
  };
}

export function timelineItems<E extends TimelineEvent, R extends TimelineRecording>(
  events: readonly E[],
  recordings: readonly R[],
  cameraIds: readonly string[],
  filter: TimelineFilter,
): TimelineItem<E, R>[] {
  const fromEvents = events.flatMap((event): TimelineItem<E, R>[] => {
    const deviceId = event.device_id;
    if (
      deviceId === null ||
      !cameraIds.includes(deviceId) ||
      !CAMERA_EVENT_KINDS.includes(event.kind) ||
      !shown(filter, deviceId, event.kind) ||
      !soundShown(filter, event)
    ) {
      return [];
    }
    const own = recordingsOf(recordings, event.id);
    return [
      {
        id: event.id,
        at: event.occurred_at,
        kind: event.kind,
        deviceId,
        event,
        details: event.details ?? {},
        ...own,
      },
    ];
  });
  const known = new Set(events.map((event) => event.id));
  const loose = recordings.filter(
    (recording) =>
      (recording.event_id === null || !known.has(recording.event_id)) &&
      cameraIds.includes(recording.device_id) &&
      shown(filter, recording.device_id, 'recording'),
  );
  const fromRecordings = loose.map((recording): TimelineItem<E, R> => ({
    id: recording.id,
    at: recording.started_at,
    kind: 'recording',
    deviceId: recording.device_id,
    event: null,
    snapshot: recording.kind === 'snapshot' ? recording : null,
    clip: recording.kind === 'clip' ? recording : null,
  }));
  return [...fromEvents, ...fromRecordings].sort(byNewest);
}

export interface TimelineMark {
  readonly id: string;
  readonly start: number;
  readonly kind: TimelineKind;
}

export function marksOf(
  items: readonly { readonly id: string; readonly at: string; readonly kind: TimelineKind }[],
  timeZone: string,
): TimelineMark[] {
  return items.map((item) => ({
    id: item.id,
    start: dayFraction(item.at, timeZone),
    kind: item.kind,
  }));
}
