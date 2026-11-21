import {
  PLANNER_BOOKING_CONFIRMATION,
  PLANNER_SIGNAL,
  PLANNER_SIGNAL_SOURCE,
  type PlannerBookingConfirmation,
  type PlannerBookingPageView,
  type PlannerBookingRequest,
  type PlannerBookingSlots,
  type SignalInput,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { InviteService } from '../invites/service';
import type { BookingReserved, BookingWindow } from '../units/booking';

export interface BookingDeps {
  readonly store: Pick<Store, 'host'>;
  readonly invites: Pick<InviteService, 'prepare' | 'deliver' | 'rsvpPathOf'>;
  readonly now: () => Date;
  readonly emit: (signal: SignalInput) => void;
}

export class BookingService {
  constructor(private readonly deps: BookingDeps) {}

  view(token: string): Promise<PlannerBookingPageView> {
    return this.deps.store.host.read('plannerBookingView', { token });
  }

  slots(token: string, window: BookingWindow): Promise<PlannerBookingSlots> {
    return this.deps.store.host.read('plannerBookingSlots', {
      token,
      window: { from: window.from, to: window.to },
    });
  }

  async book(token: string, request: PlannerBookingRequest): Promise<PlannerBookingConfirmation> {
    const { invites } = this.deps;
    const booked = await this.deps.store.host.write('plannerBookingReserve', { token, request });
    await invites.prepare(booked.guestId);
    this.announce(booked, request.name);
    await invites.deliver(booked.guestId, 'booking_confirmation');
    return PLANNER_BOOKING_CONFIRMATION.parse({
      title: booked.page.title,
      start: booked.start,
      end: booked.end,
      location: booked.page.location,
      cancel_path: invites.rsvpPathOf(booked.guestId),
    });
  }

  private announce(booked: BookingReserved, bookerName: string): void {
    const { page, item, start } = booked;
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
        data: { itemId: item.id, pageId: page.id, title: item.title, startsAt: start, bookerName },
      }),
    );
  }
}
