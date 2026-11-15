import type {
  PlannerGuestEntry,
  PlannerGuestRow,
  PlannerGuestSuggestion,
  PlannerItemRow,
  PlannerRsvpAnswer,
} from '@smarteverything/domain';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  readPlannerInviteLink,
  resendPlannerInvite,
  respondPlannerInvite,
  setPlannerGuests,
  suggestPlannerGuests,
} from '../../../api/planner-sharing';
import { PLANNER_PREFIX } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import type { EntityStore } from '../../../store/entity-store';
import { applyChange } from '../../../store/live-reducers';
import { memoOnInputs } from '../../../store/memo-selector';
import { rowsOf, type StoreState } from '../../../store/state';
import { shallowEqual, useEntityStore, useStoreSelector } from '../../../store/store-context';
import { rowEdit, writeOptimistically, type RowAccess } from './optimistic';
import { apiPerson, profileIn, type PlannerPerson } from './person';

export interface Invitation {
  readonly item: PlannerItemRow;
  readonly guest: PlannerGuestRow;
}

type Select<T> = (state: StoreState) => T;

export function itemGuestsSelector(itemId: string): Select<readonly PlannerGuestRow[]> {
  return memoOnInputs(
    (state) => [state.tables.planner_guests],
    (state) => rowsOf(state.tables.planner_guests).filter((row) => row.item_id === itemId),
  );
}

function openItem(item: PlannerItemRow | undefined): item is PlannerItemRow {
  return item?.deleted_at === null && item.status !== 'cancelled';
}

export function invitationsSelector(person: PlannerPerson): Select<readonly Invitation[]> {
  return memoOnInputs(
    (state) => [state.tables.planner_guests, state.tables.planner_items, state.session],
    (state) => {
      const profile = profileIn(state, person);
      if (profile === null) return [];
      return rowsOf(state.tables.planner_guests).flatMap((guest) => {
        if (guest.kind !== 'person' || guest.profile_id !== profile) return [];
        const item = state.tables.planner_items.byId[guest.item_id];
        return openItem(item) && item.profile_id !== profile ? [{ item, guest }] : [];
      });
    },
  );
}

export function myGuestSelector(
  person: PlannerPerson,
  itemId: string,
): Select<PlannerGuestRow | null> {
  return (state) => {
    const profile = profileIn(state, person);
    return (
      rowsOf(state.tables.planner_guests).find(
        (row) => row.item_id === itemId && row.kind === 'person' && row.profile_id === profile,
      ) ?? null
    );
  };
}

export function useItemGuests(itemId: string): readonly PlannerGuestRow[] {
  const select = useMemo(() => itemGuestsSelector(itemId), [itemId]);
  return useStoreSelector(select, shallowEqual);
}

export function useMyInvitations(person: PlannerPerson): readonly Invitation[] {
  const select = useMemo(() => invitationsSelector(person), [person]);
  return useStoreSelector(select, shallowEqual);
}

export function useMyGuest(person: PlannerPerson, itemId: string): PlannerGuestRow | null {
  const select = useMemo(() => myGuestSelector(person, itemId), [person, itemId]);
  return useStoreSelector(select);
}

function guestAccess(id: string): RowAccess<PlannerGuestRow> {
  return {
    find: (state) => state.tables.planner_guests.byId[id] ?? null,
    put: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'planner_guests',
        operation: 'UPDATE',
        record: row,
        oldRecord: null,
      }),
    drop: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'planner_guests',
        operation: 'DELETE',
        record: null,
        oldRecord: row,
      }),
  };
}

export interface RsvpChoice {
  readonly response: PlannerRsvpAnswer;
  readonly note: string | null;
}

export function answeredGuest(
  guest: PlannerGuestRow,
  choice: RsvpChoice,
  now: Date,
): PlannerGuestRow {
  return {
    ...guest,
    response: choice.response,
    note: choice.note,
    responded_at: now.toISOString(),
  };
}

export interface GuestWrites {
  readonly setGuests: (
    itemId: string,
    guests: readonly PlannerGuestEntry[],
  ) => Promise<PlannerGuestRow[]>;
  readonly respond: (guest: PlannerGuestRow, choice: RsvpChoice) => Promise<PlannerGuestRow>;
  readonly resend: (guest: PlannerGuestRow) => Promise<PlannerGuestRow>;
  readonly inviteLink: (guest: PlannerGuestRow) => Promise<string>;
}

export function guestWrites(store: EntityStore, person: PlannerPerson): GuestWrites {
  const who = apiPerson(person);
  return {
    setGuests: (itemId, guests) => setPlannerGuests(who, itemId, { guests: [...guests] }),
    respond: (guest, choice) =>
      writeOptimistically(
        store,
        'planner_guest.respond',
        [rowEdit(guestAccess(guest.id), guest, answeredGuest(guest, choice, new Date()))],
        () => respondPlannerInvite(who, guest.item_id, choice),
      ),
    resend: (guest) => resendPlannerInvite(who, guest.item_id, guest.id),
    inviteLink: (guest) => readPlannerInviteLink(who, guest.item_id, guest.id),
  };
}

export function useGuestWrites(person: PlannerPerson): GuestWrites {
  const store = useEntityStore();
  return useMemo(() => guestWrites(store, person), [store, person]);
}

export function guestSuggestionsQuery(
  person: PlannerPerson,
  text: string,
): {
  readonly queryKey: readonly unknown[];
  readonly queryFn: () => Promise<PlannerGuestSuggestion[]>;
} {
  return {
    queryKey: [...PLANNER_PREFIX, 'guest-suggestions', person, text],
    queryFn: () => suggestPlannerGuests(apiPerson(person), text),
  };
}

export function useGuestSuggestions(
  person: PlannerPerson,
  text: string,
): UseQueryResult<PlannerGuestSuggestion[]> {
  return useScreenQuery(guestSuggestionsQuery(person, text.trim()));
}
