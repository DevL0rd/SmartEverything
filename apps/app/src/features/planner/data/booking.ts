import type {
  API_ENDPOINTS as E,
  PlannerBookingPageRow,
  PlannerGuestRow,
} from '@smarteverything/domain';
import { useMemo } from 'react';
import type { z } from 'zod';
import {
  createPlannerBookingPage,
  deletePlannerBookingPage,
  resetPlannerBookingLink,
  updatePlannerBookingPage,
} from '../../../api/planner-booking';
import { useConnection } from '../../../api/transport';
import { memoOnInputs } from '../../../store/memo-selector';
import { useSettings } from '../../../store/selectors';
import { rowsOf, type StoreState } from '../../../store/state';
import { shallowEqual, useStoreSelector } from '../../../store/store-context';
import { apiPerson, type PlannerPerson } from './person';
import { ownRows } from './selectors';

type Body<K extends keyof typeof E> = z.input<(typeof E)[K]['body']>;

export interface BookingWrites {
  readonly create: (body: Body<'createPlannerBookingPage'>) => Promise<PlannerBookingPageRow>;
  readonly update: (
    pageId: string,
    body: Body<'updatePlannerBookingPage'>,
  ) => Promise<PlannerBookingPageRow>;
  readonly remove: (pageId: string) => Promise<void>;
  readonly resetLink: (pageId: string) => Promise<PlannerBookingPageRow>;
}

export interface BookingLinkBase {
  readonly publicUrl: string | null;
  readonly hubUrl: string | null;
}

type Select<T> = (state: StoreState) => readonly T[];

export function bookingPagesSelector(person: PlannerPerson): Select<PlannerBookingPageRow> {
  return ownRows((state) => state.tables.planner_booking_pages, person);
}

const guestsSelector: Select<PlannerGuestRow> = memoOnInputs(
  (state) => [state.tables.planner_guests],
  (state) => rowsOf(state.tables.planner_guests),
);

export function bookingWrites(person: PlannerPerson): BookingWrites {
  const who = apiPerson(person);
  return {
    create: (body) => createPlannerBookingPage(who, body),
    update: (pageId, body) => updatePlannerBookingPage(who, pageId, body),
    remove: (pageId) => deletePlannerBookingPage(who, pageId),
    resetLink: (pageId) => resetPlannerBookingLink(who, pageId),
  };
}

export function usePlannerBookingPages(person: PlannerPerson): readonly PlannerBookingPageRow[] {
  const select = useMemo(() => bookingPagesSelector(person), [person]);
  return useStoreSelector(select, shallowEqual);
}

export function useBookingGuests(): readonly PlannerGuestRow[] {
  return useStoreSelector(guestsSelector, shallowEqual);
}

export function usePlannerBookingWrites(person: PlannerPerson): BookingWrites {
  return useMemo(() => bookingWrites(person), [person]);
}

export function useBookingLinkBase(): BookingLinkBase {
  const connection = useConnection();
  const publicUrl = useSettings().public_url;
  return {
    publicUrl,
    hubUrl: connection.status === 'paired' ? connection.connection.url : null,
  };
}
