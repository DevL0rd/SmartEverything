import {
  ApiError,
  USAGE_SERIES_POINTS_MAX,
  localClock,
  shiftedDate,
  zonedInstant,
  type CalendarDate,
  type UsageBucket,
} from '@smarteverything/domain';

const HOUR_MS = 3_600_000;

export interface BucketSpan {
  readonly start: number;
  readonly end: number;
}

class TooManyBucketsError extends ApiError {
  constructor(bucket: UsageBucket) {
    super(
      'invalid_request',
      `That range is too long to show by ${bucket}; pick a larger step or a shorter range.`,
    );
  }
}

interface Anchor {
  readonly date: CalendarDate;
  readonly minute: number;
}

function anchorOf(instant: number, bucket: UsageBucket, timeZone: string): Anchor {
  const clock = localClock(new Date(instant), timeZone);
  const date = { year: clock.year, month: clock.month, day: clock.day };
  if (bucket === 'hour') {
    return { date, minute: Math.floor(clock.minuteOfDay / 60) * 60 };
  }
  if (bucket === 'week') {
    return { date: shiftedDate(date, -((clock.weekday + 6) % 7)), minute: 0 };
  }
  if (bucket === 'month') {
    return { date: { ...date, day: 1 }, minute: 0 };
  }
  return { date, minute: 0 };
}

function following(anchor: Anchor, bucket: UsageBucket): Anchor {
  if (bucket === 'week') {
    return { date: shiftedDate(anchor.date, 7), minute: 0 };
  }
  if (bucket === 'month') {
    const next = new Date(Date.UTC(anchor.date.year, anchor.date.month, 1));
    return {
      date: { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: 1 },
      minute: 0,
    };
  }
  return { date: shiftedDate(anchor.date, 1), minute: 0 };
}

function hourSpans(from: number, to: number, timeZone: string): BucketSpan[] {
  const first = anchorOf(from, 'hour', timeZone);
  const spans: BucketSpan[] = [];
  for (
    let start = zonedInstant(first.date, first.minute, timeZone).getTime();
    start < to;
    start += HOUR_MS
  ) {
    spans.push({ start, end: start + HOUR_MS });
    if (spans.length > USAGE_SERIES_POINTS_MAX) {
      throw new TooManyBucketsError('hour');
    }
  }
  return spans;
}

export function bucketSpans(
  from: number,
  to: number,
  bucket: UsageBucket,
  timeZone: string,
): BucketSpan[] {
  if (bucket === 'hour') {
    return hourSpans(from, to, timeZone);
  }
  const spans: BucketSpan[] = [];
  let anchor = anchorOf(from, bucket, timeZone);
  let start = zonedInstant(anchor.date, anchor.minute, timeZone).getTime();
  while (start < to) {
    anchor = following(anchor, bucket);
    const end = zonedInstant(anchor.date, anchor.minute, timeZone).getTime();
    spans.push({ start, end });
    if (spans.length > USAGE_SERIES_POINTS_MAX) {
      throw new TooManyBucketsError(bucket);
    }
    start = end;
  }
  return spans;
}
