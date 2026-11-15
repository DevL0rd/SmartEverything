import {
  ApiError,
  PLANNER_BOOKED_NOTICE,
  PLANNER_BOOKING_CONFIRMATION,
  PLANNER_BOOKING_PAGE_VIEW,
  PLANNER_BOOKING_SLOTS,
  PLANNER_PUBLIC_TOKEN,
  PLANNER_SIGNAL,
  PLANNER_SIGNAL_SOURCE,
  type PlannerBookingConfirmation,
  type PlannerBookingPageRow,
  type PlannerBookingPageView,
  type PlannerBookingRequest,
  type PlannerBookingSlots,
  type PlannerItemRow,
  type SignalInput,
} from '@smarteverything/domain';
import type { PlannerItemInput } from '../../store/repositories/planner-items';
import type { Store } from '../../store/store';
import type { BusyReader } from '../free-slots';
import { newGuestToken } from '../guests/guest-list';
import { instantsOf, isoOf } from '../instants';
import type { InviteService } from '../invites/service';
import { bookableSlots } from './slots';

export type BookingStore = BusyReader &
  Pick<
    Store,
    | 'plannerBookingPages'
    | 'plannerCollections'
    | 'plannerGuests'
    | 'plannerItems'
    | 'profiles'
    | 'settings'
    | 'feed'
    | 'write'
  >;

export interface BookingDeps {
  readonly store: BookingStore;
  readonly invites: Pick<InviteService, 'prepare' | 'deliver' | 'rsvpPathOf'>;
  readonly now: () => Date;
  readonly emit: (signal: SignalInput) => void;
}

function unavailable(): ApiError {
  return new ApiError('not_found', 'This booking page is not available.');
}

function localOf(instant: Temporal.Instant, zone: string): string {
  return instant.toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: 'minute' });
}

export class BookingService {
  constructor(private readonly deps: BookingDeps) {}

  view(token: string): PlannerBookingPageView {
    const page = this.pageOf(token);
    return PLANNER_BOOKING_PAGE_VIEW.parse({
      title: page.title,
      description: page.description,
      minutes: page.minutes,
      location: page.location,
      host: this.deps.store.profiles.byId(page.profile_id).name,
      host_time_zone: this.zone(),
      ahead_days: page.ahead_days,
    });
  }

  slots(
    token: string,
    window: { readonly from: string; readonly to: string },
  ): PlannerBookingSlots {
    const page = this.pageOf(token);
    return PLANNER_BOOKING_SLOTS.parse({
      page: this.view(token),
      slots: this.slotsOf(
        page,
        Temporal.Instant.from(window.from),
        Temporal.Instant.from(window.to),
      ),
    });
  }

  async book(token: string, request: PlannerBookingRequest): Promise<PlannerBookingConfirmation> {
    const booked = this.deps.store.write(() => this.reserve(token, request));
    await this.deps.invites.deliver(booked.guestId, 'booking_confirmation');
    return booked.confirmation;
  }

  private zone(): string {
    return this.deps.store.settings.read().time_zone;
  }

  private pageOf(token: string): PlannerBookingPageRow {
    if (!PLANNER_PUBLIC_TOKEN.safeParse(token).success) throw unavailable();
    const page = this.deps.store.plannerBookingPages.byToken(token);
    if (page?.enabled !== true) throw unavailable();
    return page;
  }

  private slotsOf(
    page: PlannerBookingPageRow,
    from: Temporal.Instant,
    to: Temporal.Instant,
  ): PlannerBookingSlots['slots'] {
    return bookableSlots(this.deps.store, {
      page,
      from,
      to,
      now: Temporal.Instant.from(this.deps.now().toISOString()),
      timeZone: this.zone(),
    });
  }

  private reserve(
    token: string,
    request: PlannerBookingRequest,
  ): { readonly guestId: string; readonly confirmation: PlannerBookingConfirmation } {
    const { store, invites } = this.deps;
    const page = this.pageOf(token);
    const start = Temporal.Instant.from(request.start);
    const end = start.add({ minutes: page.minutes });
    const offered = this.slotsOf(page, start, end);
    if (!offered.some((slot) => slot.start === isoOf(start))) {
      throw new ApiError('conflict', 'That time is no longer available.');
    }
    const item = store.plannerItems.insert(this.itemOf(page, request, start, end));
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
    invites.prepare(guest.id);
    store.plannerGuests.update(guest.id, {
      response: 'yes',
      responded_at: this.deps.now().toISOString(),
    });
    this.announce(page, item, { startsAt: isoOf(start), bookerName: request.name });
    return {
      guestId: guest.id,
      confirmation: PLANNER_BOOKING_CONFIRMATION.parse({
        title: page.title,
        start: isoOf(start),
        end: isoOf(end),
        location: page.location,
        cancel_path: invites.rsvpPathOf(guest.id),
      }),
    };
  }

  private itemOf(
    page: PlannerBookingPageRow,
    request: PlannerBookingRequest,
    start: Temporal.Instant,
    end: Temporal.Instant,
  ): PlannerItemInput {
    const { store } = this.deps;
    const collection = store.plannerCollections.byId(page.collection_id, page.profile_id);
    const zone = this.zone();
    const timing = {
      start_local: localOf(start, zone),
      end_local: localOf(end, zone),
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

  private announce(
    page: PlannerBookingPageRow,
    item: PlannerItemRow,
    made: { readonly startsAt: string; readonly bookerName: string },
  ): void {
    const { startsAt, bookerName } = made;
    this.deps.store.feed.notice(
      PLANNER_BOOKED_NOTICE.parse({
        type: 'planner_booked',
        personId: page.profile_id,
        itemId: item.id,
        pageId: page.id,
        title: item.title,
        startsAt,
      }),
    );
    this.deps.emit(
      PLANNER_SIGNAL.parse({
        source: PLANNER_SIGNAL_SOURCE,
        kind: 'booking_made',
        subject: item.id,
        field: null,
        value: null,
        previous: null,
        at: this.deps.now().toISOString(),
        profileId: page.profile_id,
        data: { itemId: item.id, pageId: page.id, title: item.title, startsAt, bookerName },
      }),
    );
  }
}
