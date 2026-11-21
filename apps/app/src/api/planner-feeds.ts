import {
  API_ENDPOINTS as E,
  type PlannerCollectionRow,
  type PlannerExportLink,
  type PlannerHolidayRegion,
  type PlannerImportResult,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { UploadOptions } from './connection/binary-upload';
import { plannerPersonQuery, type PlannerPersonId } from './planner-person';
import { api } from './transport';

type Body<K extends keyof typeof E> = z.input<(typeof E)[K]['body']>;

export async function createPlannerFeed(
  personId: PlannerPersonId,
  body: Body<'createPlannerFeed'>,
): Promise<PlannerCollectionRow> {
  return api().call(E.createPlannerFeed, { query: plannerPersonQuery(personId), body });
}

export async function updatePlannerFeed(
  personId: PlannerPersonId,
  collectionId: string,
  body: Body<'updatePlannerFeed'>,
): Promise<PlannerCollectionRow> {
  return api().call(E.updatePlannerFeed, {
    params: { collectionId },
    query: plannerPersonQuery(personId),
    body,
  });
}

export async function refreshPlannerFeed(
  personId: PlannerPersonId,
  collectionId: string,
): Promise<PlannerCollectionRow> {
  return api().call(E.refreshPlannerFeed, {
    params: { collectionId },
    query: plannerPersonQuery(personId),
  });
}

export async function readPlannerHolidayRegions(
  signal: AbortSignal,
): Promise<PlannerHolidayRegion[]> {
  return api().call(E.readPlannerHolidayRegions, {}, { signal });
}

export async function readPlannerExportLink(
  personId: PlannerPersonId,
  collectionId: string,
  signal: AbortSignal,
): Promise<PlannerExportLink | null> {
  return api().call(
    E.readPlannerExportLink,
    {
      params: { collectionId },
      query: plannerPersonQuery(personId),
    },
    { signal },
  );
}

export async function createPlannerExportLink(
  personId: PlannerPersonId,
  collectionId: string,
): Promise<PlannerExportLink> {
  return api().call(E.createPlannerExportLink, {
    params: { collectionId },
    query: plannerPersonQuery(personId),
  });
}

export async function deletePlannerExportLink(
  personId: PlannerPersonId,
  collectionId: string,
): Promise<void> {
  await api().call(E.deletePlannerExportLink, {
    params: { collectionId },
    query: plannerPersonQuery(personId),
  });
}

export async function importPlannerCalendar(
  personId: PlannerPersonId,
  collectionId: string,
  file: Blob,
  options: UploadOptions,
): Promise<PlannerImportResult> {
  return api().upload(
    E.importPlannerCalendar,
    { params: { collectionId }, query: plannerPersonQuery(personId) },
    file,
    options,
  );
}

export async function exportPlannerCalendar(
  personId: PlannerPersonId,
  collectionId: string,
): Promise<Uint8Array> {
  return api().callBytes(E.exportPlannerCalendar, {
    params: { collectionId },
    query: plannerPersonQuery(personId),
  });
}

export async function exportPlannerItem(
  personId: PlannerPersonId,
  itemId: string,
): Promise<Uint8Array> {
  return api().callBytes(E.exportPlannerItem, {
    params: { itemId },
    query: plannerPersonQuery(personId),
  });
}
