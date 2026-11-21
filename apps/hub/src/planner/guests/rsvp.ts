import {
  ApiError,
  PLANNER_INVITED_NOTICE,
  PLANNER_RSVP_NOTICE,
  PLANNER_SIGNAL,
  PLANNER_SIGNAL_SOURCE,
  type LiveChange,
  type PlannerGuestRow,
  type PlannerItemRow,
  type PlannerRsvpAnswer,
  type SignalInput,
} from '@smarteverything/domain';
import type { HostStore } from '../../store/host/host-store';
import type { Store } from '../../store/store';

export interface RsvpOptions {
  readonly store: Pick<Store, 'feed' | 'host'>;
  readonly now: () => Date;
  readonly emit: (signal: SignalInput) => void;
}

export function respondAsMember(
  store: Pick<HostStore, 'plannerGuests'>,
  item: PlannerItemRow,
  profileId: string,
  answer: {
    readonly response: PlannerRsvpAnswer;
    readonly note: string | null;
    readonly at: string;
  },
): PlannerGuestRow {
  const guest = store.plannerGuests.ofPerson(item.series_id ?? item.id, profileId);
  if (guest === undefined) throw new ApiError('forbidden', 'You are not a guest of this event.');
  return store.plannerGuests.update(guest.id, {
    response: answer.response,
    note: answer.note,
    responded_at: answer.at,
  });
}

async function invited(options: RsvpOptions, guest: PlannerGuestRow): Promise<void> {
  if (guest.profile_id === null) return;
  const item = await options.store.host.call('plannerItems', 'findAny', guest.item_id);
  if (item === undefined || item.profile_id === guest.profile_id) return;
  options.store.feed.notice(
    PLANNER_INVITED_NOTICE.parse({
      type: 'planner_invited',
      personId: guest.profile_id,
      itemId: item.id,
      title: item.title,
      startsAt: item.start,
      inviterId: item.profile_id,
    }),
  );
}

async function responded(options: RsvpOptions, guest: PlannerGuestRow): Promise<void> {
  const item = await options.store.host.call('plannerItems', 'findAny', guest.item_id);
  if (item === undefined || guest.response === 'needs_action') return;
  if (item.created_by !== 'booking' || guest.response !== 'yes') {
    options.store.feed.notice(
      PLANNER_RSVP_NOTICE.parse({
        type: 'planner_rsvp',
        personId: item.profile_id,
        itemId: item.id,
        guestId: guest.id,
        title: item.title,
        response: guest.response,
      }),
    );
  }
  options.emit(
    PLANNER_SIGNAL.parse({
      source: PLANNER_SIGNAL_SOURCE,
      kind: 'guest_responded',
      subject: item.id,
      field: null,
      value: guest.response,
      previous: null,
      at: options.now().toISOString(),
      profileId: item.profile_id,
      data: {
        itemId: item.id,
        guestId: guest.id,
        title: item.title,
        response: guest.response,
      },
    }),
  );
}

export async function followGuests(options: RsvpOptions, change: LiveChange): Promise<void> {
  if (change.table !== 'planner_guests' || change.record === null) return;
  if (change.oldRecord === null) await invited(options, change.record);
  else if (change.oldRecord.response !== change.record.response) {
    await responded(options, change.record);
  }
}
