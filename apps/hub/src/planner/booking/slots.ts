import type { PlannerBookingPageRow, PlannerBookingSlots } from '@smarteverything/domain';
import { busySpansOf, type BusyReader, type Span } from '../free-slots';
import { isoOf } from '../instants';

type Slot = PlannerBookingSlots['slots'][number];

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export interface SlotQuery {
  readonly page: PlannerBookingPageRow;
  readonly from: Temporal.Instant;
  readonly to: Temporal.Instant;
  readonly now: Temporal.Instant;
  readonly timeZone: string;
}

interface Bounds {
  readonly first: Temporal.Instant;
  readonly last: Temporal.Instant;
}

function later(a: Temporal.Instant, b: Temporal.Instant): Temporal.Instant {
  return Temporal.Instant.compare(a, b) >= 0 ? a : b;
}

function earlier(a: Temporal.Instant, b: Temporal.Instant): Temporal.Instant {
  return Temporal.Instant.compare(a, b) <= 0 ? a : b;
}

function minutes(count: number): { readonly milliseconds: number } {
  return { milliseconds: count * MINUTE_MS };
}

function boundsOf(query: SlotQuery): Bounds {
  const { page, now } = query;
  return {
    first: later(query.from, now.add(minutes(page.notice_minutes))),
    last: earlier(query.to, now.add({ milliseconds: page.ahead_days * DAY_MS })),
  };
}

function clear(busy: readonly Span[], from: Temporal.Instant, to: Temporal.Instant): boolean {
  return busy.every(
    (span) =>
      Temporal.Instant.compare(to, span.from) <= 0 || Temporal.Instant.compare(span.to, from) <= 0,
  );
}

function datesOf(bounds: Bounds, timeZone: string): Temporal.PlainDate[] {
  const dates: Temporal.PlainDate[] = [];
  const last = bounds.last.toZonedDateTimeISO(timeZone).toPlainDate();
  let date = bounds.first.toZonedDateTimeISO(timeZone).toPlainDate();
  while (Temporal.PlainDate.compare(date, last) <= 0) {
    dates.push(date);
    date = date.add({ days: 1 });
  }
  return dates;
}

function startsOn(
  page: PlannerBookingPageRow,
  date: Temporal.PlainDate,
  timeZone: string,
): Temporal.Instant[] {
  const length = page.minutes * MINUTE_MS;
  return page.availability
    .filter((window) => window.day === date.dayOfWeek % 7)
    .flatMap((window) => {
      const end = date.toZonedDateTime({ timeZone, plainTime: window.end }).epochMilliseconds;
      const starts: Temporal.Instant[] = [];
      let start = date.toZonedDateTime({ timeZone, plainTime: window.start });
      while (start.epochMilliseconds + length <= end) {
        starts.push(start.toInstant());
        start = start.add({ milliseconds: length });
      }
      return starts;
    });
}

function heldSpans(store: BusyReader, page: PlannerBookingPageRow): Span[] {
  return store.plannerItems
    .list(page.profile_id, { collectionIds: [page.collection_id] })
    .filter(
      (item) =>
        item.created_by === 'booking' &&
        item.status === 'cancelled' &&
        item.start !== null &&
        item.end !== null &&
        store.plannerGuests.forItem(item.id).some((guest) => guest.response === 'no'),
    )
    .map((item) => ({
      from: Temporal.Instant.from(item.start ?? ''),
      to: Temporal.Instant.from(item.end ?? ''),
    }));
}

export function bookableSlots(store: BusyReader, query: SlotQuery): readonly Slot[] {
  const { page, timeZone } = query;
  const bounds = boundsOf(query);
  if (Temporal.Instant.compare(bounds.first, bounds.last) >= 0) return [];
  const length = minutes(page.minutes);
  const busy = [
    ...busySpansOf(store, {
      profileId: page.profile_id,
      from: bounds.first.subtract(minutes(page.buffer_before)),
      to: bounds.last.add(minutes(page.minutes + page.buffer_after)),
      timeZone,
      now: query.now,
    }),
    ...heldSpans(store, page),
  ];
  return datesOf(bounds, timeZone)
    .flatMap((date) => startsOn(page, date, timeZone))
    .filter(
      (begins) =>
        Temporal.Instant.compare(begins, bounds.first) >= 0 &&
        Temporal.Instant.compare(begins, bounds.last) < 0 &&
        clear(
          busy,
          begins.subtract(minutes(page.buffer_before)),
          begins.add(minutes(page.minutes + page.buffer_after)),
        ),
    )
    .map((begins) => ({ start: isoOf(begins), end: isoOf(begins.add(length)) }));
}
