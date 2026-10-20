import { appendTo, type AutomationRunSummary, type Place } from '@smarteverything/domain';
import { HOUR_MS, MINUTE_MS } from '../../../format/time';
import { upcomingRuns, type ScheduledV3 } from '../model/consumers/week-schedule';

export const TIMELINE_HOURS = 12;

export interface TimelineRule {
  readonly id: string;
  readonly name: string;
  readonly scheduled: ScheduledV3;
}

export interface TimelineEvent {
  readonly key: string;
  readonly automationId: string;
  readonly name: string;
  readonly at: Date;
  readonly kind: 'timed' | 'parked';
  readonly fraction: number;
}

function placed(
  events: readonly Omit<TimelineEvent, 'fraction'>[],
  start: number,
): readonly TimelineEvent[] {
  return [...events]
    .sort((left, right) => left.at.getTime() - right.at.getTime())
    .map((event) => ({
      ...event,
      fraction: (event.at.getTime() - start) / (TIMELINE_HOURS * HOUR_MS),
    }));
}

export interface TimelineInput {
  readonly rules: readonly TimelineRule[];
  readonly runs: readonly AutomationRunSummary[];
  readonly names: ReadonlyMap<string, string>;
  readonly now: number;
  readonly place: Place;
}

export function timelineOf({
  rules,
  runs,
  names,
  now,
  place,
}: TimelineInput): readonly TimelineEvent[] {
  const window = { start: new Date(now), end: new Date(now + TIMELINE_HOURS * HOUR_MS) };
  const timed = upcomingRuns(rules, window, place).map((upcoming) => ({
    key: upcoming.key,
    automationId: upcoming.automationId,
    name: upcoming.name,
    at: upcoming.at,
    kind: 'timed' as const,
  }));
  const parked = runs.flatMap((run) => {
    const wake = run.wake_at === null ? null : new Date(run.wake_at);
    const name = names.get(run.automation_id);
    return run.status === 'waiting' &&
      wake !== null &&
      name !== undefined &&
      wake >= window.start &&
      wake < window.end
      ? [
          {
            key: `${run.id}:wake`,
            automationId: run.automation_id,
            name,
            at: wake,
            kind: 'parked' as const,
          },
        ]
      : [];
  });
  return placed([...timed, ...parked], now);
}

export function nextUp(events: readonly TimelineEvent[]): TimelineEvent | null {
  return events[0] ?? null;
}

export interface TimelineGroup {
  readonly key: string;
  readonly automationId: string;
  readonly name: string;
  readonly kind: TimelineEvent['kind'];
  readonly events: readonly TimelineEvent[];
  readonly everyMinutes: number | null;
}

function cadenceOf(events: readonly TimelineEvent[]): number | null {
  const first = events[0];
  const second = events[1];
  if (events.length < 3 || first === undefined || second === undefined) {
    return null;
  }
  const step = second.at.getTime() - first.at.getTime();
  const even = events.every(
    (event, index) =>
      index === 0 ||
      Math.abs(event.at.getTime() - (events[index - 1]?.at.getTime() ?? 0) - step) < MINUTE_MS,
  );
  return even ? Math.round(step / MINUTE_MS) : null;
}

export function groupTimeline(events: readonly TimelineEvent[]): readonly TimelineGroup[] {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const key = `${event.automationId}:${event.kind}`;
    appendTo(groups, key, event);
  }
  return [...groups.entries()].map(([key, members]) => ({
    key,
    automationId: members[0]?.automationId ?? '',
    name: members[0]?.name ?? '',
    kind: members[0]?.kind ?? 'timed',
    events: members,
    everyMinutes: cadenceOf(members),
  }));
}
