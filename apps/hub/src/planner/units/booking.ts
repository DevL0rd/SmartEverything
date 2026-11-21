import {
  ApiError,
  PLANNER_BOOKED_NOTICE,
  PLANNER_BOOKING_PAGE_VIEW,
  PLANNER_BOOKING_SLOTS,
  PLANNER_PUBLIC_TOKEN,
  type PlannerBookingPageRow,
  type PlannerBookingPageView,
  type PlannerBookingRequest,
  type PlannerBookingSlots,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { PlannerItemInput } from '../../store/repositories/planner-items';
import type { Store } from '../../store/store';
import { bookableSlots } from '../booking/slots';
import { newGuestToken } from '../guests/guest-list';
import { instantsOf, isoOf } from '../instants';

export interface BookingWindow {
  readonly from: string;
  readonly to: string;
}

export interface BookingReserve {
  readonly token: string;
  readonly request: PlannerBookingRequest;
}

export interface BookingReserved {
  readonly guestId: string;
  readonly page: Pick<PlannerBookingPageRow, 'id' | 'profile_id' | 'title' | 'location'>;
  readonly item: Pick<PlannerItemRow, 'id' | 'title'>;
  readonly start: string;
  readonly end: string;
}

function unavailable(): ApiError {
  return new ApiError('not_found', 'This booking page is not available.');
}

function localOf(instant: Temporal.Instant, zone: string): string {
  return instant.toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: 'minute' });
}

function zoneOf(store: Store): string {
  return store.settings.read().time_zone;
}

function nowOf(store: Store): Temporal.Instant {
  return Temporal.Instant.from(store.context.now());
}

function pageOf(store: Store, token: string): PlannerBookingPageRow {
  if (!PLANNER_PUBLIC_TOKEN.safeParse(token).success) throw unavailable();
  const page = store.plannerBookingPages.byToken(token);
  if (page?.enabled !== true) throw unavailable();
  return page;
}

function viewOf(store: Store, token: string): PlannerBookingPageView {
  const page = pageOf(store, token);
  return PLANNER_BOOKING_PAGE_VIEW.parse({
    title: page.title,
    description: page.description,
    minutes: page.minutes,
    location: page.location,
    host: store.profiles.byId(page.profile_id).name,
    host_time_zone: zoneOf(store),
    ahead_days: page.ahead_days,
  });
}

function slotsOf(
  store: Store,
  page: PlannerBookingPageRow,
  from: Temporal.Instant,
  to: Temporal.Instant,
): PlannerBookingSlots['slots'] {
  return bookableSlots(store, { page, from, to, now: nowOf(store), timeZone: zoneOf(store) });
}

function slotsView(
  store: Store,
  { token, window }: { readonly token: string; readonly window: BookingWindow },
): PlannerBookingSlots {
  const page = pageOf(store, token);
  return PLANNER_BOOKING_SLOTS.parse({
    page: viewOf(store, token),
    slots: slotsOf(
      store,
      page,
      Temporal.Instant.from(window.from),
      Temporal.Instant.from(window.to),
    ),
  });
}

function itemOf(
  store: Store,
  page: PlannerBookingPageRow,
  request: PlannerBookingRequest,
  span: { readonly start: Temporal.Instant; readonly end: Temporal.Instant },
): PlannerItemInput {
  const collection = store.plannerCollections.byId(page.collection_id, page.profile_id);
  const zone = zoneOf(store);
  const timing = {
    start_local: localOf(span.start, zone),
    end_local: localOf(span.end, zone),
    time_zone: zone,
    all_day: false,
    rrule: null,
  };
  return {
    ...timing,
    ...instantsOf(timing),
    profile_id: page.profile_id,
    collection_id: collection.id,
    kind: 'event',
    parent_id: null,
    title: `${page.title}: ${request.name}`,
    notes: request.note,
    location: page.location,
    priority: null,
    tags: [],
    estimate_minutes: null,
    due_date: null,
    due_at: null,
    exdates: [],
    series_id: null,
    original_start: null,
    status: 'open',
    position: store.plannerItems.list(page.profile_id, { collectionIds: [collection.id] }).length,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: collection.default_reminders,
    google: null,
    assignee_id: null,
    ical_uid: null,
    ical_sequence: 0,
    booking_page_id: page.id,
    created_by: 'booking',
  };
}

function reserve(store: Store, { token, request }: BookingReserve): BookingReserved {
  const page = pageOf(store, token);
  const start = Temporal.Instant.from(request.start);
  const end = start.add({ minutes: page.minutes });
  if (!slotsOf(store, page, start, end).some((slot) => slot.start === isoOf(start))) {
    throw new ApiError('conflict', 'That time is no longer available.');
  }
  const item = store.plannerItems.insert(itemOf(store, page, request, { start, end }));
  const guest = store.plannerGuests.insert({
    item_id: item.id,
    kind: 'email',
    profile_id: null,
    email: request.email,
    name: request.name,
    delivery: 'not_sent',
    delivery_detail: null,
    token_hash: newGuestToken().hash,
  });
  store.plannerGuests.update(guest.id, { response: 'yes', responded_at: store.context.now() });
  store.feed.notice(
    PLANNER_BOOKED_NOTICE.parse({
      type: 'planner_booked',
      personId: page.profile_id,
      itemId: item.id,
      pageId: page.id,
      title: item.title,
      startsAt: isoOf(start),
    }),
  );
  return {
    guestId: guest.id,
    page: { id: page.id, profile_id: page.profile_id, title: page.title, location: page.location },
    item: { id: item.id, title: item.title },
    start: isoOf(start),
    end: isoOf(end),
  };
}

export const PLANNER_BOOKING_READ_UNITS = {
  plannerBookingView: storeUnit((store, { token }: { readonly token: string }) =>
    viewOf(store, token),
  ),
  plannerBookingSlots: storeUnit(slotsView),
} as const;

export const PLANNER_BOOKING_WRITE_UNITS = {
  plannerBookingReserve: storeUnit(reserve),
} as const;
