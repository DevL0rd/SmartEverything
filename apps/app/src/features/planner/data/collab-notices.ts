import type {
  PlannerAssignedNotice,
  PlannerInvitedNotice,
  PlannerRsvpAnswer,
  PlannerRsvpNotice,
} from '@smarteverything/domain';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { notify } from '../../../components/toast-store';
import type { StoreState } from '../../../store/state';

function viewerOf(state: StoreState): string | null {
  return state.session?.client.profile_id ?? null;
}

function nameIn(state: StoreState, profileId: string | null): string {
  if (profileId === null) return 'Someone';
  return state.tables.profiles.byId[profileId]?.name ?? 'Someone';
}

function guestNameIn(state: StoreState, guestId: string): string {
  const guest = state.tables.planner_guests.byId[guestId];
  if (guest === undefined) return 'A guest';
  if (guest.kind === 'person') return nameIn(state, guest.profile_id);
  return guest.name ?? guest.email ?? 'A guest';
}

function openAction(itemId: string): { readonly label: string; readonly onPress: () => void } {
  return {
    label: 'Open',
    onPress: (): void => {
      router.push(href.planner.item(itemId, null));
    },
  };
}

export function invitedTextOf(notice: PlannerInvitedNotice, state: StoreState): string {
  return `${nameIn(state, notice.inviterId)} invited you to ${notice.title}`;
}

export function assignedTextOf(notice: PlannerAssignedNotice, state: StoreState): string {
  if (notice.state === 'done')
    return `${nameIn(state, notice.assigneeId)} finished ${notice.title}`;
  return `${nameIn(state, notice.assignerId)} gave you a task: ${notice.title}`;
}

const ANSWER_WORDS: Readonly<Record<PlannerRsvpAnswer, string>> = {
  yes: 'is going to',
  maybe: 'might go to',
  no: 'isn’t going to',
};

export function rsvpTextOf(notice: PlannerRsvpNotice, state: StoreState): string {
  return `${guestNameIn(state, notice.guestId)} ${ANSWER_WORDS[notice.response]} ${notice.title}`;
}

function mine(personId: string, state: StoreState): boolean {
  return viewerOf(state) === personId;
}

export function receiveInvited(notice: PlannerInvitedNotice, state: StoreState): void {
  if (!mine(notice.personId, state)) return;
  notify({ message: invitedTextOf(notice, state), action: openAction(notice.itemId) });
}

export function receiveAssigned(notice: PlannerAssignedNotice, state: StoreState): void {
  if (!mine(notice.personId, state)) return;
  notify({ message: assignedTextOf(notice, state), action: openAction(notice.itemId) });
}

export function receiveRsvp(notice: PlannerRsvpNotice, state: StoreState): void {
  if (!mine(notice.personId, state)) return;
  notify({ message: rsvpTextOf(notice, state), action: openAction(notice.itemId) });
}
