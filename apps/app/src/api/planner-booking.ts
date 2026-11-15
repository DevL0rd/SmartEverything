import { API_ENDPOINTS as E, type PlannerBookingPageRow } from '@smarteverything/domain';
import type { z } from 'zod';
import { plannerPersonQuery, type PlannerPersonId } from './planner-person';
import { api } from './transport';

type Body<K extends keyof typeof E> = z.input<(typeof E)[K]['body']>;

export async function listPlannerBookingPages(
  personId: PlannerPersonId,
): Promise<PlannerBookingPageRow[]> {
  return api().call(E.listPlannerBookingPages, { query: plannerPersonQuery(personId) });
}

export async function createPlannerBookingPage(
  personId: PlannerPersonId,
  body: Body<'createPlannerBookingPage'>,
): Promise<PlannerBookingPageRow> {
  return api().call(E.createPlannerBookingPage, { query: plannerPersonQuery(personId), body });
}

export async function updatePlannerBookingPage(
  personId: PlannerPersonId,
  pageId: string,
  body: Body<'updatePlannerBookingPage'>,
): Promise<PlannerBookingPageRow> {
  return api().call(E.updatePlannerBookingPage, {
    params: { pageId },
    query: plannerPersonQuery(personId),
    body,
  });
}

export async function deletePlannerBookingPage(
  personId: PlannerPersonId,
  pageId: string,
): Promise<void> {
  await api().call(E.deletePlannerBookingPage, {
    params: { pageId },
    query: plannerPersonQuery(personId),
  });
}

export async function resetPlannerBookingLink(
  personId: PlannerPersonId,
  pageId: string,
): Promise<PlannerBookingPageRow> {
  return api().call(E.resetPlannerBookingLink, {
    params: { pageId },
    query: plannerPersonQuery(personId),
  });
}
