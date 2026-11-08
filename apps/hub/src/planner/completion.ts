import {
  PLANNER_SIGNAL,
  PLANNER_SIGNAL_SOURCE,
  signalMatchesMatcher,
  type PlannerEvidence,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
  type PlannerOccurrenceView,
  type SignalInput,
  type SignalMatcher,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { Clock } from '../clock';
import type { SignalListener } from '../signals/bus';
import type { Store } from '../store/store';
import { expandOccurrences } from './occurrences';

export type CompletionStore = Pick<
  Store,
  'profiles' | 'settings' | 'plannerItems' | 'plannerOccurrences' | 'write'
>;

export interface CompletionWatcherOptions {
  readonly store: CompletionStore;
  readonly clock: Pick<Clock, 'now'>;
  readonly emit: (signal: SignalInput) => void;
  readonly log: Logger;
}

export interface SignalSource {
  readonly subscribe: (listener: SignalListener) => () => void;
}

interface SignalRule {
  readonly matcher: SignalMatcher;
  readonly window: 'occurrence' | 'day';
}

interface Completed {
  readonly item: PlannerItemRow;
  readonly view: PlannerOccurrenceView;
  readonly row: PlannerOccurrenceRow;
}

interface Day {
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly zone: string;
}

const OPEN_STATUSES: ReadonlySet<PlannerOccurrenceView['status']> = new Set(['open', 'missed']);

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function ruleOf(item: PlannerItemRow): SignalRule | null {
  const { completion } = item;
  return completion.kind === 'signal'
    ? { matcher: completion.matcher, window: completion.window }
    : null;
}

function ownerOf(signal: SignalInput): string | null {
  return signal.profileId ?? textOf(signal.data['profileId']);
}

function evidenceOf(signal: SignalInput): PlannerEvidence {
  const device = z.uuid().safeParse(signal.subject);
  return {
    source: signal.source,
    deviceId: device.success ? device.data : null,
    summary: textOf(signal.data['summary']) ?? `${signal.source} ${signal.kind}`,
    sessionId: textOf(signal.data['sessionId']) ?? textOf(signal.data['eventId']),
  };
}

function limitOf(view: PlannerOccurrenceView, siblings: readonly PlannerOccurrenceView[]): number {
  const start = Date.parse(view.start ?? '');
  if (view.end !== null && Date.parse(view.end) > start) return Date.parse(view.end);
  const later = siblings
    .map((sibling) => Date.parse(sibling.start ?? ''))
    .filter((moment) => moment > start);
  return Math.min(...later, Number.POSITIVE_INFINITY);
}

function inSpan(
  view: PlannerOccurrenceView,
  siblings: readonly PlannerOccurrenceView[],
  at: number,
  dayEnd: number,
): boolean {
  if (view.all_day || view.start === null) return true;
  return Date.parse(view.start) <= at && at < Math.min(limitOf(view, siblings), dayEnd);
}

export class CompletionWatcher {
  constructor(private readonly options: CompletionWatcherOptions) {}

  attach(source: SignalSource): () => void {
    return source.subscribe((signal) => {
      this.handle(signal);
    });
  }

  handle(signal: SignalInput): readonly PlannerOccurrenceRow[] {
    if (signal.source === PLANNER_SIGNAL_SOURCE) return [];
    const day = this.dayOf(Date.parse(signal.at));
    const completed = this.options.store.write(() =>
      this.candidates(signal).flatMap((item) => this.complete(item, signal, day)),
    );
    for (const entry of completed) this.announce(entry);
    return completed.map((entry) => entry.row);
  }

  private dayOf(at: number): Day {
    const zone = this.options.store.settings.read().time_zone;
    const start = Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(zone).startOfDay();
    return { start: start.toInstant(), end: start.add({ days: 1 }).toInstant(), zone };
  }

  private candidates(signal: SignalInput): readonly PlannerItemRow[] {
    const { plannerItems, profiles } = this.options.store;
    const owner = ownerOf(signal);
    const ids = owner === null ? profiles.list().map((profile) => profile.id) : [owner];
    return ids
      .flatMap((id) => plannerItems.list(id, { statuses: ['open'] }))
      .filter((item) => {
        const rule = ruleOf(item);
        return rule !== null && signalMatchesMatcher(rule.matcher, signal);
      });
  }

  private openViews(item: PlannerItemRow, day: Day): readonly PlannerOccurrenceView[] {
    const { store, clock } = this.options;
    const overrides =
      item.rrule === null ? [] : store.plannerItems.overrides(item.id, item.profile_id);
    const items = [item, ...overrides];
    return expandOccurrences({
      items,
      stored: store.plannerOccurrences.forItems(items.map((entry) => entry.id)),
      window: { from: day.start, to: day.end, timeZone: day.zone },
      now: Temporal.Instant.fromEpochMilliseconds(clock.now().getTime()),
    }).filter((view) => view.item_id === item.id && OPEN_STATUSES.has(view.status));
  }

  private complete(item: PlannerItemRow, signal: SignalInput, day: Day): readonly Completed[] {
    const rule = ruleOf(item);
    if (rule === null) return [];
    const views = this.openViews(item, day);
    const at = Date.parse(signal.at);
    const wanted =
      rule.window === 'day'
        ? views
        : views.filter((view) => inSpan(view, views, at, day.end.epochMilliseconds));
    return wanted.map((view) => ({ item, view, row: this.save(item, view, signal) }));
  }

  private save(
    item: PlannerItemRow,
    view: PlannerOccurrenceView,
    signal: SignalInput,
  ): PlannerOccurrenceRow {
    const { plannerOccurrences, plannerItems } = this.options.store;
    const existing = plannerOccurrences.find(item.id, view.occurrence_key);
    const row = plannerOccurrences.save({
      item_id: item.id,
      occurrence_key: view.occurrence_key,
      status: 'done',
      completed_at: signal.at,
      completed_by: 'signal',
      evidence: evidenceOf(signal),
      moved_start: existing?.moved_start ?? null,
      moved_end: existing?.moved_end ?? null,
    });
    if (item.rrule === null) plannerItems.update(item.id, item.profile_id, { status: 'done' });
    this.options.log.info('planner.completed_by_signal', {
      itemId: item.id,
      occurrenceKey: view.occurrence_key,
      source: signal.source,
      kind: signal.kind,
      subject: signal.subject,
    });
    return row;
  }

  private announce({ item, view }: Completed): void {
    this.options.emit(
      PLANNER_SIGNAL.parse({
        source: PLANNER_SIGNAL_SOURCE,
        kind: 'task_done',
        subject: item.id,
        field: null,
        value: view.occurrence_key,
        previous: null,
        at: this.options.clock.now().toISOString(),
        profileId: item.profile_id,
        data: {
          itemId: item.id,
          occurrenceKey: view.occurrence_key,
          title: item.title,
          dueAt: view.due_at,
          completedBy: 'signal',
        },
      }),
    );
  }
}
