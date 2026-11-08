import {
  PLANNER_STATS,
  type PlannerOccurrenceView,
  type PlannerRingRow,
  type PlannerStats,
  type PlannerStatsRange,
  type PlannerTimerRow,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { isoOf } from './instants';
import { composeRange, type PlannerReader } from './range';

export type StatsReader = PlannerReader & Pick<Store, 'plannerRings' | 'plannerTimers'>;

export interface StatsQuery {
  readonly profileId: string;
  readonly range: PlannerStatsRange;
  readonly now: Temporal.Instant;
  readonly timeZone: string;
}

interface Frame {
  readonly from: string;
  readonly to: string;
  readonly days: readonly string[];
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly timeZone: string;
}

interface Tally {
  done: number;
  due: number;
}

const RANGE_DAYS: Readonly<Record<PlannerStatsRange, number>> = {
  week: 7,
  month: 30,
  year: 365,
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTE_MS = 60_000;

function frameOf(query: StatsQuery): Frame {
  const last = query.now.toZonedDateTimeISO(query.timeZone).toPlainDate();
  const first = last.subtract({ days: RANGE_DAYS[query.range] - 1 });
  const days = Array.from({ length: RANGE_DAYS[query.range] }, (_, index) =>
    first.add({ days: index }).toString(),
  );
  return {
    from: first.toString(),
    to: last.toString(),
    days,
    start: first.toZonedDateTime(query.timeZone).toInstant(),
    end: last.add({ days: 1 }).toZonedDateTime(query.timeZone).toInstant(),
    timeZone: query.timeZone,
  };
}

function dayOf(moment: string | Temporal.Instant, zone: string): string {
  const instant = typeof moment === 'string' ? Temporal.Instant.from(moment) : moment;
  return instant.toZonedDateTimeISO(zone).toPlainDate().toString();
}

function anchorDay(view: PlannerOccurrenceView, zone: string): string | null {
  if (view.due_date !== null) return view.due_date;
  if (view.due_at !== null) return dayOf(view.due_at, zone);
  if (view.start === null) return null;
  return view.all_day ? dayOf(view.start, 'UTC') : dayOf(view.start, zone);
}

function deadline(view: PlannerOccurrenceView, zone: string): Temporal.Instant | null {
  if (view.due_at !== null) return Temporal.Instant.from(view.due_at);
  if (view.due_date !== null) {
    return Temporal.PlainDate.from(view.due_date)
      .add({ days: 1 })
      .toZonedDateTime(zone)
      .toInstant();
  }
  const last = view.end ?? view.start;
  return last === null ? null : Temporal.Instant.from(last);
}

function live(view: PlannerOccurrenceView): boolean {
  return view.status !== 'cancelled' && view.status !== 'proposed';
}

function inFrame(day: string | null, frame: Frame): day is string {
  return day !== null && day >= frame.from && day <= frame.to;
}

function dueTasks(views: readonly PlannerOccurrenceView[], frame: Frame): readonly Anchored[] {
  return views.flatMap((view) => {
    const day = anchorDay(view, frame.timeZone);
    const counted = view.kind === 'task' && (view.status === 'done' || view.status === 'missed');
    return counted && inFrame(day, frame) ? [{ view, day }] : [];
  });
}

interface Anchored {
  readonly view: PlannerOccurrenceView;
  readonly day: string;
}

function tallyOf(entries: readonly Anchored[]): Tally {
  const done = entries.filter(({ view }) => view.status === 'done').length;
  return { done, due: entries.length };
}

function onTime(entries: readonly Anchored[], zone: string): PlannerStats['on_time'] {
  let onTimeCount = 0;
  let late = 0;
  for (const { view } of entries) {
    if (view.status !== 'done') continue;
    const limit = deadline(view, zone);
    const finished = view.completed_at === null ? null : Temporal.Instant.from(view.completed_at);
    const isLate =
      limit !== null && finished !== null && Temporal.Instant.compare(finished, limit) > 0;
    if (isLate) late += 1;
    else onTimeCount += 1;
  }
  return { on_time: onTimeCount, late };
}

function perDay(entries: readonly Anchored[]): ReadonlyMap<string, Tally> {
  const days = new Map<string, Tally>();
  for (const { view, day } of entries) {
    const tally = days.get(day) ?? { done: 0, due: 0 };
    tally.due += 1;
    if (view.status === 'done') tally.done += 1;
    days.set(day, tally);
  }
  return days;
}

function streaks(days: ReadonlyMap<string, Tally>, frame: Frame): PlannerStats['streaks'] {
  let current = 0;
  let longest = 0;
  for (const day of frame.days) {
    const tally = days.get(day);
    if (tally === undefined || tally.due === 0) continue;
    if (tally.done === tally.due) {
      current += 1;
      longest = Math.max(longest, current);
    } else if (day !== frame.to) {
      current = 0;
    }
  }
  return { current, longest };
}

function bestHours(entries: readonly Anchored[], zone: string): PlannerStats['best_hours'] {
  const counts = new Map<number, number>();
  for (const { view } of entries) {
    if (view.status !== 'done' || view.completed_at === null) continue;
    const hour = Temporal.Instant.from(view.completed_at).toZonedDateTimeISO(zone).hour;
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  return HOURS.map((hour) => ({ hour, done: counts.get(hour) ?? 0 }));
}

function deviceShare(entries: readonly Anchored[]): PlannerStats['device_share'] {
  const done = entries.filter(({ view }) => view.status === 'done');
  const byDevice = done.filter(({ view }) => view.completed_by === 'signal').length;
  return { by_device: byDevice, by_hand: done.length - byDevice };
}

function listTrends(entries: readonly Anchored[], frame: Frame): PlannerStats['list_trends'] {
  const lists = new Map<string, Anchored[]>();
  for (const entry of entries) {
    const members = lists.get(entry.view.collection_id) ?? [];
    members.push(entry);
    lists.set(entry.view.collection_id, members);
  }
  return [...lists]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([collectionId, members]) => {
      const days = perDay(members);
      return {
        collection_id: collectionId,
        points: frame.days.map((day) => ({ day, ...(days.get(day) ?? { done: 0, due: 0 }) })),
      };
    });
}

function spanPerDay(
  view: PlannerOccurrenceView,
  frame: Frame,
): readonly (readonly [string, number])[] {
  if (view.all_day || view.start === null || view.end === null) return [];
  const finish = Temporal.Instant.from(view.end);
  const spans: [string, number][] = [];
  let cursor = Temporal.Instant.from(view.start).toZonedDateTimeISO(frame.timeZone);
  while (Temporal.Instant.compare(cursor.toInstant(), finish) < 0) {
    const midnight = cursor.toPlainDate().add({ days: 1 }).toZonedDateTime(frame.timeZone);
    const stop = Temporal.Instant.compare(midnight.toInstant(), finish) < 0 ? midnight : null;
    const until = stop === null ? finish : stop.toInstant();
    const day = cursor.toPlainDate().toString();
    if (day >= frame.from && day <= frame.to) {
      spans.push([day, until.epochMilliseconds - cursor.epochMilliseconds]);
    }
    if (stop === null) break;
    cursor = stop;
  }
  return spans;
}

function sumMap(pairs: readonly (readonly [string, number])[]): ReadonlyMap<string, number> {
  const sums = new Map<string, number>();
  for (const [key, value] of pairs) sums.set(key, (sums.get(key) ?? 0) + value);
  return sums;
}

function timeByCalendar(
  views: readonly PlannerOccurrenceView[],
  frame: Frame,
): PlannerStats['time_by_calendar'] {
  const totals = sumMap(
    views
      .filter((view) => view.kind === 'event' && live(view))
      .flatMap((view) =>
        spanPerDay(view, frame).map(([, ms]) => [view.collection_id, ms] as const),
      ),
  );
  return [...totals]
    .map(([collectionId, ms]) => ({
      collection_id: collectionId,
      minutes: Math.round(ms / MINUTE_MS),
    }))
    .filter((entry) => entry.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || a.collection_id.localeCompare(b.collection_id));
}

function weeklyLoad(
  views: readonly PlannerOccurrenceView[],
  frame: Frame,
): PlannerStats['weekly_load'] {
  const active = views.filter(live);
  const minutes = sumMap(active.flatMap((view) => spanPerDay(view, frame)));
  const items = sumMap(
    active.flatMap((view) => {
      const day = anchorDay(view, frame.timeZone);
      return inFrame(day, frame) ? [[day, 1] as const] : [];
    }),
  );
  return frame.days.map((day) => ({
    day,
    scheduled_minutes: Math.round((minutes.get(day) ?? 0) / MINUTE_MS),
    items: items.get(day) ?? 0,
  }));
}

function timerUse(timers: readonly PlannerTimerRow[], frame: Frame): PlannerStats['timer_use'] {
  const groups = new Map<
    string,
    { day: string; label: string | null; count: number; total_ms: number }
  >();
  for (const timer of timers) {
    if (timer.state !== 'done' || timer.ends_at === null) continue;
    const day = dayOf(timer.ends_at, frame.timeZone);
    if (day < frame.from || day > frame.to) continue;
    const key = `${day}|${timer.label ?? ''}`;
    const group = groups.get(key) ?? { day, label: timer.label, count: 0, total_ms: 0 };
    group.count += 1;
    group.total_ms += timer.duration_ms;
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => a.day.localeCompare(b.day) || (a.label ?? '').localeCompare(b.label ?? ''),
  );
}

function wakeMinute(ring: PlannerRingRow, zone: string): number {
  const up = Temporal.Instant.from(ring.dismissed_at ?? ring.rang_at ?? ring.due_at);
  const local = up.toZonedDateTimeISO(zone);
  return local.hour * 60 + local.minute;
}

function alarmStats(rings: readonly PlannerRingRow[], zone: string): PlannerStats['alarms'] {
  const alarms = new Map<string, PlannerRingRow[]>();
  for (const ring of rings.filter((entry) => entry.kind === 'alarm')) {
    const own = alarms.get(ring.ref_id) ?? [];
    own.push(ring);
    alarms.set(ring.ref_id, own);
  }
  return [...alarms]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([alarmId, own]) => {
      const rang = own.filter((ring) => ring.outcome === 'rang');
      const minutes = rang.map((ring) => wakeMinute(ring, zone));
      const average =
        minutes.length === 0 ? null : minutes.reduce((a, b) => a + b, 0) / minutes.length;
      const variance =
        average === null
          ? null
          : minutes.reduce((sum, value) => sum + (value - average) ** 2, 0) / minutes.length;
      return {
        alarm_id: alarmId,
        rang: rang.length,
        missed: own.length - rang.length,
        snoozes: own.reduce((sum, ring) => sum + ring.snoozes, 0),
        average_minute: average === null ? null : Math.round(average),
        spread_minutes: variance === null ? null : Math.round(Math.sqrt(variance)),
      };
    });
}

export function composeStats(store: StatsReader, query: StatsQuery): PlannerStats {
  const frame = frameOf(query);
  const { occurrences } = composeRange(store, {
    profileId: query.profileId,
    window: { from: frame.start, to: frame.end, timeZone: query.timeZone },
    now: query.now,
  });
  const entries = dueTasks(occurrences, frame);
  const rings = store.plannerRings.between(query.profileId, {
    from: isoOf(frame.start),
    to: isoOf(frame.end),
  });
  return PLANNER_STATS.parse({
    range: query.range,
    from: frame.from,
    to: frame.to,
    completion: tallyOf(entries),
    on_time: onTime(entries, query.timeZone),
    streaks: streaks(perDay(entries), frame),
    best_hours: bestHours(entries, query.timeZone),
    time_by_calendar: timeByCalendar(occurrences, frame),
    weekly_load: weeklyLoad(occurrences, frame),
    device_share: deviceShare(entries),
    list_trends: listTrends(entries, frame),
    timer_use: timerUse(store.plannerTimers.list(query.profileId), frame),
    alarms: alarmStats(rings, query.timeZone),
  });
}
