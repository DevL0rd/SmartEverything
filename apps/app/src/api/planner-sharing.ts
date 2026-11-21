import {
  API_ENDPOINTS as E,
  type PlannerCollectionShareRow,
  type PlannerGuestRow,
  type PlannerGuestSuggestion,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { plannerPersonQuery, type PlannerPersonId } from './planner-person';
import { api } from './transport';

type Body<K extends keyof typeof E> = z.input<(typeof E)[K]['body']>;

export async function sharePlannerCollection(
  personId: PlannerPersonId,
  collectionId: string,
  sharedWith: string,
  body: Body<'sharePlannerCollection'>,
): Promise<PlannerCollectionShareRow> {
  return api().call(E.sharePlannerCollection, {
    params: { collectionId, personId: sharedWith },
    query: plannerPersonQuery(personId),
    body,
  });
}

export async function changePlannerShare(
  personId: PlannerPersonId,
  collectionId: string,
  viewer: string,
  body: Body<'changePlannerShare'>,
): Promise<PlannerCollectionShareRow> {
  return api().call(E.changePlannerShare, {
    params: { collectionId, personId: viewer },
    query: plannerPersonQuery(personId),
    body,
  });
}

export async function unsharePlannerCollection(
  personId: PlannerPersonId,
  collectionId: string,
  sharedWith: string,
): Promise<void> {
  await api().call(E.unsharePlannerCollection, {
    params: { collectionId, personId: sharedWith },
    query: plannerPersonQuery(personId),
  });
}

export async function setPlannerGuests(
  personId: PlannerPersonId,
  itemId: string,
  body: Body<'setPlannerGuests'>,
): Promise<PlannerGuestRow[]> {
  return api().call(E.setPlannerGuests, {
    params: { itemId },
    query: plannerPersonQuery(personId),
    body,
  });
}

export async function respondPlannerInvite(
  personId: PlannerPersonId,
  itemId: string,
  body: Body<'respondPlannerInvite'>,
): Promise<PlannerGuestRow> {
  return api().call(E.respondPlannerInvite, {
    params: { itemId },
    query: plannerPersonQuery(personId),
    body,
  });
}

export async function resendPlannerInvite(
  personId: PlannerPersonId,
  itemId: string,
  guestId: string,
): Promise<PlannerGuestRow> {
  return api().call(E.resendPlannerInvite, {
    params: { itemId, guestId },
    query: plannerPersonQuery(personId),
  });
}

export async function readPlannerInviteLink(
  personId: PlannerPersonId,
  itemId: string,
  guestId: string,
): Promise<string> {
  const { url } = await api().call(E.plannerInviteLink, {
    params: { itemId, guestId },
    query: plannerPersonQuery(personId),
  });
  return url;
}

export async function suggestPlannerGuests(
  personId: PlannerPersonId,
  text: string,
  signal: AbortSignal,
): Promise<PlannerGuestSuggestion[]> {
  return api().call(
    E.suggestPlannerGuests,
    { query: { ...plannerPersonQuery(personId), text } },
    { signal },
  );
}
