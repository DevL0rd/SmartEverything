import type { PlannerFreeSlot, PlannerOccurrenceView } from '@smarteverything/domain';
import { isoOf } from './instants';
import { expandOccurrences } from './occurrences';
import { loadWindow, type PlannerReader } from './range';

const MINUTE_MS = 60_000;

const IDLE: ReadonlySet<string> = new Set(['cancelled', 'skipped', 'proposed']);

export interface Span {
  readonly from: Temporal.Instant;
  readonly to: Temporal.Instant;
}

export interface FreeSlotQuery {
  readonly profileId: string;
  readonly from: Temporal.Instant;
  readonly to: Temporal.Instant;
  readonly minutes: number;
  readonly timeZone: string;
  readonly now: Temporal.Instant;
}

function isBefore(a: Temporal.Instant, b: Temporal.Instant): boolean {
  return Temporal.Instant.compare(a, b) < 0;
}

export function busySpan(view: PlannerOccurrenceView): Span | null {
  if (view.all_day || IDLE.has(view.status) || view.start === null) return null;
  const stop = view.end ?? view.due_at;
  if (stop === null) return null;
  const from = Temporal.Instant.from(view.start);
  const to = Temporal.Instant.from(stop);
  return isBefore(from, to) ? { from, to } : null;
}

function merged(spans: readonly Span[]): Span[] {
  const ordered = [...spans].sort((a, b) => Temporal.Instant.compare(a.from, b.from));
  const joined: Span[] = [];
  for (const span of ordered) {
    const last = joined.at(-1);
    if (last !== undefined && !isBefore(last.to, span.from)) {
      if (isBefore(last.to, span.to)) joined[joined.length - 1] = { from: last.from, to: span.to };
    } else {
      joined.push(span);
    }
  }
  return joined;
}

function slotOf(span: Span, minutes: number): PlannerFreeSlot | null {
  const length = Math.floor((span.to.epochMilliseconds - span.from.epochMilliseconds) / MINUTE_MS);
  return length >= minutes ? { from: isoOf(span.from), to: isoOf(span.to), minutes: length } : null;
}

export function freeSlots(
  busy: readonly Span[],
  window: Span,
  minutes: number,
): readonly PlannerFreeSlot[] {
  const slots: PlannerFreeSlot[] = [];
  let cursor = window.from;
  for (const block of merged(busy)) {
    if (isBefore(cursor, block.from)) {
      const gap = { from: cursor, to: isBefore(block.from, window.to) ? block.from : window.to };
      const slot = slotOf(gap, minutes);
      if (slot !== null) slots.push(slot);
    }
    if (isBefore(cursor, block.to)) cursor = block.to;
  }
  if (isBefore(cursor, window.to)) {
    const slot = slotOf({ from: cursor, to: window.to }, minutes);
    if (slot !== null) slots.push(slot);
  }
  return slots;
}

export function freeSlotsFromStore(
  store: PlannerReader,
  query: FreeSlotQuery,
): readonly PlannerFreeSlot[] {
  const window = { from: query.from, to: query.to, timeZone: query.timeZone };
  const loaded = loadWindow(store, query.profileId, window);
  const views = expandOccurrences({
    items: loaded.items,
    stored: loaded.stored,
    window,
    now: query.now,
  });
  const busy = views.map(busySpan).filter((span) => span !== null);
  return freeSlots(busy, { from: query.from, to: query.to }, query.minutes);
}
