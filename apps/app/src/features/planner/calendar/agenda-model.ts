import type {
  PlannerCollectionRow,
  PlannerColourKey,
  PlannerOccurrenceView,
} from '@smarteverything/domain';
import { joinParts } from '../../../format/text';
import { clock24 } from '../../../format/time';
import { LOOK_WORDS, type EventLook } from './calendars-model';
import {
  countsOf,
  dayLabelOf,
  daysFrom,
  monthOf,
  timedSpanOf,
  type DayMap,
  type RowEdge,
} from './month-model';

export interface AgendaEntry {
  readonly key: string;
  readonly occurrence: PlannerOccurrenceView;
  readonly time: string;
  readonly range: string;
  readonly detail: string;
  readonly note: string;
  readonly calendar: string | null;
  readonly colour: PlannerColourKey | null;
  readonly google: boolean;
  readonly look: EventLook;
  readonly spoken: string;
}

export interface AgendaHead {
  readonly label: string;
  readonly counts: string;
  readonly today: boolean;
}

export type AgendaRow =
  | { readonly kind: 'head'; readonly key: string; readonly head: AgendaHead }
  | {
      readonly kind: 'entry';
      readonly key: string;
      readonly entry: AgendaEntry;
      readonly edge: RowEdge;
    };

function timesOf(
  view: PlannerOccurrenceView,
  day: string,
  timeZone: string,
): { readonly time: string; readonly until: string | null } {
  if (view.all_day) return { time: 'All day', until: null };
  if (view.start === null) {
    return {
      time: view.due_at === null ? 'Any time' : clock24(view.due_at, timeZone),
      until: null,
    };
  }
  const [first, last] = timedSpanOf(view.start, view.end, timeZone);
  const until = view.end === null || last !== day ? null : clock24(view.end, timeZone);
  if (first === day) return { time: clock24(view.start, timeZone), until };
  return until === null
    ? { time: 'All day', until: null }
    : { time: `Until ${until}`, until: null };
}

export interface EntryContext {
  readonly collections: readonly PlannerCollectionRow[];
  readonly timeZone: string;
  readonly look: EventLook;
}

export function agendaEntryOf(
  view: PlannerOccurrenceView,
  day: string,
  { collections, timeZone, look }: EntryContext,
): AgendaEntry {
  const collection = collections.find((row) => row.id === view.collection_id);
  const { time, until } = timesOf(view, day, timeZone);
  const calendar = collection?.name ?? null;
  const detail = joinParts([
    calendar,
    view.kind === 'task' ? 'task' : null,
    until === null ? null : `until ${until}`,
    view.location,
  ]);
  const note = joinParts([view.kind === 'task' ? 'task' : null, view.location]);
  const google = view.google_state !== null;
  return {
    key: `${view.item_id}:${view.occurrence_key}`,
    occurrence: view,
    time,
    range: until === null ? time : `${time} to ${until}`,
    detail,
    note,
    calendar,
    colour: collection?.colour ?? null,
    google,
    look,
    spoken: joinParts([time, view.title, detail, google ? 'from Google' : null, LOOK_WORDS[look]]),
  };
}

function edgeOf(index: number, length: number): RowEdge {
  if (length === 1) return 'only';
  if (index === 0) return 'first';
  return index === length - 1 ? 'last' : 'middle';
}

export function matchesQuery(entry: AgendaEntry, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') return true;
  return [entry.occurrence.title, entry.occurrence.location, entry.calendar].some(
    (part) => part?.toLowerCase().includes(wanted) === true,
  );
}

export interface AgendaInput {
  readonly days: DayMap;
  readonly window: readonly [string, string];
  readonly today: string;
  readonly collections: readonly PlannerCollectionRow[];
  readonly timeZone: string;
  readonly query: string;
  readonly lookOf: (view: PlannerOccurrenceView) => EventLook;
}

function headOf(day: string, input: AgendaInput, entries: readonly AgendaEntry[]): AgendaHead {
  const today = day === input.today;
  const label = dayLabelOf(day, monthOf(day) !== monthOf(input.window[0]));
  return {
    label: today ? `Today, ${label}` : label,
    counts: countsOf(entries.map((entry) => entry.occurrence)),
    today,
  };
}

export function agendaRowsOf(input: AgendaInput): readonly AgendaRow[] {
  return daysFrom(input.window[0], input.window[1]).flatMap((day): AgendaRow[] => {
    const entries = (input.days.get(day) ?? [])
      .filter((view) => input.lookOf(view) !== 'declined')
      .map((view) =>
        agendaEntryOf(view, day, {
          collections: input.collections,
          timeZone: input.timeZone,
          look: input.lookOf(view),
        }),
      )
      .filter((entry) => matchesQuery(entry, input.query));
    if (entries.length === 0) return [];
    return [
      { kind: 'head', key: `head:${day}`, head: headOf(day, input, entries) },
      ...entries.map((entry, index) => ({
        kind: 'entry' as const,
        key: `entry:${day}:${entry.key}`,
        entry,
        edge: edgeOf(index, entries.length),
      })),
    ];
  });
}
