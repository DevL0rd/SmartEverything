import {
  ApiError,
  PLANNER_PUBLIC_TOKEN,
  PLANNER_RSVP_PAGE,
  PLANNER_RSVP_RECEIPT,
  type PlannerGuestRow,
  type PlannerItemRow,
  type PlannerRsvpAnswer,
  type PlannerRsvpPage,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { Store } from '../../store/store';
import { hashGuestToken } from '../guests/guest-list';

export type PublicRsvpStore = Pick<Store, 'plannerGuests' | 'plannerItems' | 'profiles' | 'write'>;

export interface PublicRsvpDeps {
  readonly store: PublicRsvpStore;
  readonly now: () => Date;
}

export interface RsvpAnswer {
  readonly response: PlannerRsvpAnswer;
  readonly note: string | null;
}

type Receipt = z.output<typeof PLANNER_RSVP_RECEIPT>;

interface Invite {
  readonly guest: PlannerGuestRow;
  readonly item: PlannerItemRow;
}

function unavailable(): ApiError {
  return new ApiError('not_found', 'This invitation link is no longer available.');
}

function cancelled(item: PlannerItemRow): boolean {
  return item.deleted_at !== null || item.status === 'cancelled';
}

export class PublicRsvp {
  constructor(private readonly deps: PublicRsvpDeps) {}

  pageOf(token: string): PlannerRsvpPage {
    const { guest, item } = this.inviteOf(token);
    const start = item.start_local;
    if (start === null) throw unavailable();
    return PLANNER_RSVP_PAGE.parse({
      title: item.title,
      location: item.location,
      organiser: this.deps.store.profiles.byId(item.profile_id).name,
      all_day: item.all_day,
      start_local: start,
      end_local: item.end_local,
      time_zone: item.time_zone,
      guest_name: guest.name,
      response: guest.response,
      note: guest.note,
      cancelled: cancelled(item),
      booking: item.created_by === 'booking',
    });
  }

  respond(token: string, answer: RsvpAnswer): Receipt {
    return this.deps.store.write(() => {
      const { guest, item } = this.inviteOf(token);
      if (cancelled(item)) throw new ApiError('conflict', 'This event was cancelled.');
      const at = this.deps.now().toISOString();
      const saved = this.deps.store.plannerGuests.update(guest.id, {
        response: answer.response,
        note: answer.note,
        responded_at: at,
      });
      if (item.created_by === 'booking' && answer.response === 'no') {
        this.deps.store.plannerItems.update(item.id, item.profile_id, { status: 'cancelled' });
      }
      return PLANNER_RSVP_RECEIPT.parse({
        response: answer.response,
        responded_at: saved.responded_at,
      });
    });
  }

  private inviteOf(token: string): Invite {
    const checked = PLANNER_PUBLIC_TOKEN.safeParse(token);
    if (!checked.success) throw unavailable();
    const guest = this.deps.store.plannerGuests.byToken(hashGuestToken(checked.data));
    const item =
      guest === undefined ? undefined : this.deps.store.plannerItems.findAny(guest.item_id);
    if (guest === undefined || item === undefined) throw unavailable();
    return { guest, item };
  }
}
