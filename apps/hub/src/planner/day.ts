import type {
  PlannerDay,
  PlannerHappened,
  PlannerItemRow,
  PlannerOccurrenceRow,
  PlannerOccurrenceView,
  PlannerPreferences,
  PlannerRingRow,
  PlannerStripSegment,
  PlannerSummary,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { nextRing } from './alarms';
import { isoOf } from './instants';
import { expandOccurrences } from './occurrences';
import { loadWindow } from './range';

export interface HappenedCandidate {
  readonly at: Temporal.Instant;
  readonly source: string;
  readonly deviceId: string | null;
  readonly summary: string;
  readonly sessionId: string | null;
}

export interface AlarmPin {
  readonly at: Temporal.Instant;
  readonly label: string | null;
}

export interface SleepSpan {
  readonly from: Temporal.Instant;
  readonly to: Temporal.Instant;
}

export interface DayFrame {
  readonly date: Temporal.PlainDate;
  readonly timeZone: string;
  readonly dayStart: Temporal.Instant;
  readonly dayEnd: Temporal.Instant;
  readonly lookbackFrom: Temporal.Instant;
}

export interface DayInput {
  readonly frame: DayFrame;
  readonly now: Temporal.Instant;
  readonly preferences: PlannerPreferences;
  readonly items: readonly PlannerItemRow[];
  readonly stored: readonly PlannerOccurrenceRow[];
  readonly rings: readonly PlannerRingRow[];
  readonly alarmPins: readonly AlarmPin[];
  readonly nextAlarmAt: Temporal.Instant | null;
  readonly sleep: readonly SleepSpan[];
  readonly sessions: readonly HappenedCandidate[];
}

export interface DayQuery {
  readonly profileId: string;
  readonly date: string;
  readonly timeZone: string;
  readonly now: Temporal.Instant;
  readonly lastOpen: Temporal.Instant | null;
  readonly preferences: PlannerPreferences;
  readonly sleep: readonly SleepSpan[];
  readonly sessions: readonly HappenedCandidate[];
}

export type FrameQuery = Pick<DayQuery, 'date' | 'timeZone' | 'now' | 'lastOpen' | 'preferences'>;

export type DayReader = Pick<
  Store,
  'plannerItems' | 'plannerOccurrences' | 'plannerRings' | 'plannerAlarms'
>;

interface Buckets {
  readonly missed: PlannerOccurrenceView[];
  readonly current: PlannerOccurrenceView[];
  readonly upcoming: PlannerOccurrenceView[];
  readonly done: PlannerOccurrenceView[];
}

const HIDDEN: ReadonlySet<string> = new Set(['cancelled', 'proposed', 'skipped']);

const MIDNIGHT = Temporal.PlainTime.from('00:00');

function moment(value: string): Temporal.Instant {
  return Temporal.Instant.from(value);
}

function isBefore(a: Temporal.Instant, b: Temporal.Instant): boolean {
  return Temporal.Instant.compare(a, b) < 0;
}

function within(at: Temporal.Instant, from: Temporal.Instant, to: Temporal.Instant): boolean {
  return !isBefore(at, from) && isBefore(at, to);
}

export function frameOf(query: FrameQuery): DayFrame {
  const { date, timeZone, now, preferences, lastOpen } = query;
  const day = Temporal.PlainDate.from(date);
  const dayStart = day.toZonedDateTime(timeZone).toInstant();
  const dayEnd = day.add({ days: 1 }).toZonedDateTime(timeZone).toInstant();
  const since = preferences.day_planner.missed_scope === 'today' ? null : lastOpen;
  const lookback = since !== null && isBefore(since, dayStart) ? since : dayStart;
  return {
    date: day,
    timeZone,
    dayStart,
    dayEnd,
    lookbackFrom: within(now, dayStart, dayEnd) ? lookback : dayStart,
  };
}

function utcDate(value: string): Temporal.PlainDate {
  return moment(value).toZonedDateTimeISO('UTC').toPlainDate();
}

function viewDates(view: PlannerOccurrenceView): [Temporal.PlainDate, Temporal.PlainDate] | null {
  if (view.start !== null) {
    const first = utcDate(view.start);
    const last = view.end === null ? first : utcDate(view.end).subtract({ days: 1 });
    return [first, Temporal.PlainDate.compare(last, first) < 0 ? first : last];
  }
  if (view.due_date === null) return null;
  const only = Temporal.PlainDate.from(view.due_date);
  return [only, only];
}

function touchesDay(view: PlannerOccurrenceView, frame: DayFrame): boolean {
  if (view.all_day) {
    const dates = viewDates(view);
    return (
      dates !== null &&
      Temporal.PlainDate.compare(dates[0], frame.date) <= 0 &&
      Temporal.PlainDate.compare(dates[1], frame.date) >= 0
    );
  }
  if (view.start === null) {
    return view.due_at !== null && within(moment(view.due_at), frame.dayStart, frame.dayEnd);
  }
  const start = moment(view.start);
  const end = view.end === null ? start : moment(view.end);
  if (Temporal.Instant.compare(start, end) === 0)
    return within(start, frame.dayStart, frame.dayEnd);
  return isBefore(start, frame.dayEnd) && isBefore(frame.dayStart, end);
}

function stateOf(
  view: PlannerOccurrenceView,
  now: Temporal.Instant,
): 'current' | 'upcoming' | 'past' {
  if (view.all_day || view.start === null) return 'upcoming';
  const start = moment(view.start);
  if (isBefore(now, start)) return 'upcoming';
  const stop = moment(view.end ?? view.due_at ?? view.start);
  return isBefore(now, stop) ? 'current' : 'past';
}

function completedToday(view: PlannerOccurrenceView, frame: DayFrame): boolean {
  return (
    view.completed_at !== null && within(moment(view.completed_at), frame.dayStart, frame.dayEnd)
  );
}

function place(view: PlannerOccurrenceView, input: DayInput, buckets: Buckets): void {
  if (HIDDEN.has(view.status)) return;
  const { frame, now } = input;
  const scheduled = touchesDay(view, frame);
  if (view.status === 'done') {
    if (scheduled || completedToday(view, frame)) buckets.done.push(view);
    return;
  }
  if (view.status === 'missed') {
    buckets.missed.push(view);
    return;
  }
  if (!scheduled) return;
  const state = stateOf(view, now);
  if (state === 'current') buckets.current.push(view);
  else if (state === 'upcoming') buckets.upcoming.push(view);
}

function byCompletion(a: PlannerOccurrenceView, b: PlannerOccurrenceView): number {
  return (a.completed_at ?? '').localeCompare(b.completed_at ?? '');
}

function bucketsOf(views: readonly PlannerOccurrenceView[], input: DayInput): Buckets {
  const buckets: Buckets = { missed: [], current: [], upcoming: [], done: [] };
  for (const view of views) place(view, input, buckets);
  buckets.done.sort(byCompletion);
  return buckets;
}

function segmentOf(view: PlannerOccurrenceView, frame: DayFrame): PlannerStripSegment | null {
  const point = view.start ?? view.due_at;
  if (view.all_day || point === null || !touchesDay(view, frame)) return null;
  const from = moment(point);
  const stop = view.end ?? view.due_at;
  const to = stop === null ? from : moment(stop);
  return {
    kind: view.kind === 'event' ? 'event' : 'task',
    from: isoOf(isBefore(from, frame.dayStart) ? frame.dayStart : from),
    to: isoOf(isBefore(frame.dayEnd, to) ? frame.dayEnd : to),
    label: view.title,
    collection_id: view.collection_id,
    item_id: view.item_id,
    item_kind: view.kind,
  };
}

function plain(
  kind: PlannerStripSegment['kind'],
  from: Temporal.Instant,
  to: Temporal.Instant,
  label: string | null,
): PlannerStripSegment {
  return {
    kind,
    from: isoOf(from),
    to: isoOf(to),
    label,
    collection_id: null,
    item_id: null,
    item_kind: null,
  };
}

function clipped(span: SleepSpan, frame: DayFrame): PlannerStripSegment | null {
  const from = isBefore(span.from, frame.dayStart) ? frame.dayStart : span.from;
  const to = isBefore(frame.dayEnd, span.to) ? frame.dayEnd : span.to;
  return isBefore(from, to) ? plain('sleep', from, to, null) : null;
}

function wakingSpan(input: DayInput): SleepSpan | null {
  const { general } = input.preferences;
  const { date, timeZone, dayEnd } = input.frame;
  const at = (time: string): Temporal.Instant =>
    date.toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from(time) }).toInstant();
  const from = at(general.day_start);
  const closes = Temporal.PlainTime.from(general.day_end).equals(MIDNIGHT)
    ? dayEnd
    : at(general.day_end);
  const to = isBefore(from, closes) ? closes : dayEnd;
  return isBefore(from, to) ? { from, to } : null;
}

function freeSegments(
  waking: SleepSpan | null,
  busy: readonly PlannerStripSegment[],
): PlannerStripSegment[] {
  if (waking === null) return [];
  const blocks = busy
    .filter((segment) => segment.to !== segment.from)
    .map((segment) => ({ from: moment(segment.from), to: moment(segment.to) }))
    .sort((a, b) => Temporal.Instant.compare(a.from, b.from));
  const free: PlannerStripSegment[] = [];
  let cursor = waking.from;
  for (const block of blocks) {
    if (isBefore(cursor, block.from))
      free.push(plain('free', cursor, minInstant(block.from, waking.to), null));
    if (isBefore(cursor, block.to)) cursor = block.to;
  }
  if (isBefore(cursor, waking.to)) free.push(plain('free', cursor, waking.to, null));
  return free.filter((segment) => segment.from !== segment.to);
}

function minInstant(a: Temporal.Instant, b: Temporal.Instant): Temporal.Instant {
  return isBefore(a, b) ? a : b;
}

function stripOf(views: readonly PlannerOccurrenceView[], input: DayInput): PlannerStripSegment[] {
  const items = views
    .filter((view) => !HIDDEN.has(view.status))
    .map((view) => segmentOf(view, input.frame))
    .filter((segment) => segment !== null);
  const pins = input.alarmPins
    .filter((pin) => within(pin.at, input.frame.dayStart, input.frame.dayEnd))
    .map((pin) => plain('alarm', pin.at, pin.at, pin.label));
  const sleep = input.preferences.day_planner.show_sleep
    ? input.sleep.map((span) => clipped(span, input.frame)).filter((segment) => segment !== null)
    : [];
  const free = freeSegments(wakingSpan(input), items);
  return [...items, ...pins, ...sleep, ...free].sort((a, b) => a.from.localeCompare(b.from));
}

function usedAsEvidence(
  candidate: HappenedCandidate,
  done: readonly PlannerOccurrenceView[],
): boolean {
  return done.some(({ evidence, completed_at: completedAt }) => {
    if (evidence === null) return false;
    if (candidate.sessionId !== null && evidence.sessionId === candidate.sessionId) return true;
    return (
      evidence.source === candidate.source &&
      evidence.deviceId === candidate.deviceId &&
      completedAt === isoOf(candidate.at)
    );
  });
}

function happenedOf(done: readonly PlannerOccurrenceView[], input: DayInput): PlannerHappened[] {
  if (!input.preferences.day_planner.show_happened) return [];
  const { dayStart, dayEnd } = input.frame;
  return input.sessions
    .filter((session) => within(session.at, dayStart, dayEnd) && !usedAsEvidence(session, done))
    .sort((a, b) => Temporal.Instant.compare(a.at, b.at))
    .map((session) => ({
      at: isoOf(session.at),
      source: session.source,
      deviceId: session.deviceId,
      summary: session.summary,
    }));
}

export function composeDay(input: DayInput): PlannerDay {
  const { frame, now } = input;
  const views = expandOccurrences({
    items: input.items,
    stored: input.stored,
    window: { from: frame.lookbackFrom, to: frame.dayEnd, timeZone: frame.timeZone },
    now,
  });
  const buckets = bucketsOf(views, input);
  return {
    date: frame.date.toString(),
    time_zone: frame.timeZone,
    now: isoOf(now),
    ...buckets,
    happened: happenedOf(buckets.done, input),
    rings: input.rings,
    next_alarm_at: input.nextAlarmAt === null ? null : isoOf(input.nextAlarmAt),
    strip: stripOf(views, input),
  };
}

export function summarise(
  day: PlannerDay,
): Pick<PlannerSummary, 'missed' | 'left' | 'nextAlarmAt'> {
  const tasks = (views: readonly PlannerOccurrenceView[]): number =>
    views.filter((view) => view.kind === 'task').length;
  return {
    missed: tasks(day.missed),
    left: tasks(day.current) + tasks(day.upcoming),
    nextAlarmAt: day.next_alarm_at,
  };
}

function alarmTimes(
  store: DayReader,
  query: DayQuery,
  frame: DayFrame,
): { readonly pins: AlarmPin[]; readonly next: Temporal.Instant | null } {
  const pins: AlarmPin[] = [];
  let next: Temporal.Instant | null = null;
  for (const alarm of store.plannerAlarms.list(query.profileId)) {
    if (!alarm.enabled) continue;
    const upcoming = nextRing(alarm, new Date(query.now.epochMilliseconds), query.timeZone);
    const ring =
      upcoming === null ? null : Temporal.Instant.fromEpochMilliseconds(upcoming.getTime());
    if (ring !== null && (next === null || isBefore(ring, next))) next = ring;
    const first = nextRing(alarm, new Date(frame.dayStart.epochMilliseconds - 1), query.timeZone);
    const at = first === null ? null : Temporal.Instant.fromEpochMilliseconds(first.getTime());
    if (at !== null && within(at, frame.dayStart, frame.dayEnd))
      pins.push({ at, label: alarm.label });
  }
  return { pins, next };
}

export function composeDayFromStore(store: DayReader, query: DayQuery): PlannerDay {
  const frame = frameOf(query);
  const loaded = loadWindow(store, query.profileId, {
    from: frame.lookbackFrom,
    to: frame.dayEnd,
    timeZone: query.timeZone,
  });
  const alarms = alarmTimes(store, query, frame);
  return composeDay({
    frame,
    now: query.now,
    preferences: query.preferences,
    items: loaded.items,
    stored: loaded.stored,
    rings: store.plannerRings.between(query.profileId, {
      from: isoOf(frame.dayStart),
      to: isoOf(frame.dayEnd),
    }),
    alarmPins: alarms.pins,
    nextAlarmAt: alarms.next,
    sleep: query.sleep,
    sessions: query.sessions,
  });
}
