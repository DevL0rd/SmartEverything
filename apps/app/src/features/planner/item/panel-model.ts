import {
  PLANNER_OCCURRENCE_SINGLE,
  type PlannerItemRow,
  type PlannerOccurrenceView,
} from '@smarteverything/domain';
import { dayBoundsOf, localDayKey } from '../../../format/time';

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const SPAN_AROUND_MS = 2 * HOUR_MS;

export type BarBlockKind = 'focus' | 'busy' | 'proposed';

export interface BarBlock {
  readonly key: string;
  readonly from: number;
  readonly to: number;
  readonly kind: BarBlockKind;
}

export interface DayBar {
  readonly blocks: readonly BarBlock[];
  readonly now: number | null;
  readonly free: { readonly from: number; readonly to: number } | null;
  readonly from: number;
  readonly to: number;
}

export interface Span {
  readonly from: number;
  readonly to: number;
}

export function panelDayOf(
  item: PlannerItemRow,
  occurrenceKey: string | null,
  timeZone: string,
): string | null {
  if (occurrenceKey !== null && occurrenceKey !== PLANNER_OCCURRENCE_SINGLE) {
    return occurrenceKey.length === 10 ? occurrenceKey : localDayKey(occurrenceKey, timeZone);
  }
  if (item.start !== null) return localDayKey(item.start, timeZone);
  if (item.due_date !== null) return item.due_date;
  return item.due_at === null ? null : localDayKey(item.due_at, timeZone);
}

export function dayWindowOf(
  day: string,
  timeZone: string,
): { readonly from: string; readonly to: string } {
  const bounds = dayBoundsOf(day, timeZone);
  return { from: new Date(bounds.start).toISOString(), to: new Date(bounds.end).toISOString() };
}

export function occurrenceIn(
  views: readonly PlannerOccurrenceView[],
  itemId: string,
  occurrenceKey: string | null,
): PlannerOccurrenceView | null {
  const own = views.filter((view) => view.item_id === itemId);
  return own.find((view) => view.occurrence_key === occurrenceKey) ?? own[0] ?? null;
}

export function spanOf(view: PlannerOccurrenceView): Span | null {
  const begin = view.start ?? view.due_at;
  if (begin === null || view.all_day) return null;
  const from = Date.parse(begin);
  return { from, to: view.end === null ? from : Date.parse(view.end) };
}

function kindOf(view: PlannerOccurrenceView, focus: PlannerOccurrenceView): BarBlockKind {
  if (view.item_id === focus.item_id && view.occurrence_key === focus.occurrence_key) {
    return 'focus';
  }
  return view.status === 'proposed' ? 'proposed' : 'busy';
}

function freeBefore(blocks: readonly BarBlock[], focus: Span, floor: number): Span | null {
  const ends = blocks
    .filter((block) => block.kind === 'busy' && block.to <= focus.from)
    .map((block) => block.to);
  const from = Math.max(floor, ...ends);
  return from < focus.from ? { from, to: focus.from } : null;
}

export function dayBarOf(
  views: readonly PlannerOccurrenceView[],
  focus: PlannerOccurrenceView,
  now: number,
): DayBar | null {
  const span = spanOf(focus);
  if (span === null) return null;
  const from = span.from - SPAN_AROUND_MS;
  const to = Math.max(span.to, span.from) + SPAN_AROUND_MS;
  const blocks = views.flatMap((view): BarBlock[] => {
    const shown = spanOf(view);
    if (shown === null || view.status === 'cancelled' || shown.to < from || shown.from > to) {
      return [];
    }
    return [
      {
        key: `${view.item_id}:${view.occurrence_key}`,
        from: Math.max(from, shown.from),
        to: Math.min(to, shown.to),
        kind: kindOf(view, focus),
      },
    ];
  });
  return {
    blocks,
    from,
    to,
    now: now >= from && now <= to ? now : null,
    free: freeBefore(blocks, span, from),
  };
}

export function fractionIn(bar: Pick<DayBar, 'from' | 'to'>, at: number): number {
  return bar.to === bar.from ? 0 : (at - bar.from) / (bar.to - bar.from);
}

export function proposalNear(
  views: readonly PlannerOccurrenceView[],
  focus: PlannerOccurrenceView,
): PlannerOccurrenceView | null {
  const anchor = spanOf(focus);
  const proposals = views.filter(
    (view) => view.status === 'proposed' && view.item_id !== focus.item_id,
  );
  if (anchor === null) return proposals[0] ?? null;
  const after = proposals.find((view) => (spanOf(view)?.from ?? 0) >= anchor.to);
  return after ?? proposals[0] ?? null;
}

export function lengthMinutesOf(view: PlannerOccurrenceView): number {
  const span = spanOf(view);
  if (span === null) return 1;
  return Math.max(1, Math.ceil((span.to - span.from) / MINUTE_MS));
}

export function movedSpanOf(
  slotFrom: string,
  minutes: number,
): { readonly start: string; readonly end: string } {
  return {
    start: slotFrom,
    end: new Date(Date.parse(slotFrom) + minutes * MINUTE_MS).toISOString(),
  };
}

export interface WatchLineInput {
  readonly view: PlannerOccurrenceView | null;
  readonly push: boolean;
  readonly watch: boolean;
  readonly now: number;
}

export function onWatchCalendar({ view, push, watch, now }: WatchLineInput): boolean {
  if (!push || !watch || view?.kind !== 'event') return false;
  if (view.status === 'cancelled' || view.status === 'proposed' || view.start === null)
    return false;
  return Date.parse(view.end ?? view.start) >= now;
}
