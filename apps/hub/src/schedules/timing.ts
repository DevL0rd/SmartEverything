import {
  ApiError,
  SCHEDULE_LIMITS,
  nextOccurrence,
  type ScheduleTiming,
} from '@smarteverything/domain';

const SECOND_MS = 1000;
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const CLOCK = /^\d\d:\d\d$/;

function atOf(at: string, now: Date, timeZone: string): Date {
  if (!CLOCK.test(at)) {
    return new Date(at);
  }
  const next = nextOccurrence({ type: 'time', at, weekdays: EVERY_DAY }, now, {
    timeZone,
    location: null,
  });
  if (next === null) {
    throw new ApiError('invalid_request', `There is no next ${at} in ${timeZone}.`);
  }
  return next;
}

function moments(timing: ScheduleTiming, now: Date, timeZone: string): Date[] {
  switch (timing.kind) {
    case 'at':
      return [atOf(timing.at, now, timeZone)];
    case 'in':
      return [new Date(now.getTime() + timing.seconds * SECOND_MS)];
    case 'series': {
      const every = timing.everySeconds * SECOND_MS;
      const first =
        timing.startAt === null ? now.getTime() + every : new Date(timing.startAt).getTime();
      return Array.from({ length: timing.count }, (_, index) => new Date(first + index * every));
    }
    case 'times':
      return timing.times.map((time) => new Date(time)).sort((a, b) => a.getTime() - b.getTime());
  }
}

export function occurrencesOf(timing: ScheduleTiming, now: Date, timeZone: string): string[] {
  const found = moments(timing, now, timeZone);
  const last = found.at(-1);
  if (last === undefined) {
    throw new ApiError('invalid_request', 'The timing gives no time to run.');
  }
  if (last.getTime() - now.getTime() > SCHEDULE_LIMITS.horizonSeconds * SECOND_MS) {
    throw new ApiError('invalid_request', 'Scheduled actions can run at most a year ahead.');
  }
  if (found.some((moment) => moment.getTime() < now.getTime() - SCHEDULE_LIMITS.lateAfterMs)) {
    throw new ApiError('invalid_request', 'That time has already passed.');
  }
  return found.map((moment) => moment.toISOString());
}
