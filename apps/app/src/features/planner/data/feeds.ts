import {
  resolveRegion,
  type API_ENDPOINTS as E,
  type PlannerCollectionRow,
  type PlannerExportLink,
  type PlannerFeedCreate,
  type PlannerHolidayRegion,
  type PlannerImportResult,
} from '@smarteverything/domain';
import { useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { z } from 'zod';
import {
  createPlannerExportLink,
  createPlannerFeed,
  deletePlannerExportLink,
  exportPlannerCalendar,
  importPlannerCalendar,
  readPlannerExportLink,
  readPlannerHolidayRegions,
  refreshPlannerFeed,
  updatePlannerFeed,
} from '../../../api/planner-feeds';
import { deviceRegionSource } from '../../../platform/device-region';
import { PLANNER_PREFIX } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useRegionPref } from '../../region';
import { apiPerson, type PlannerPerson } from './person';

type FeedChanges = z.input<(typeof E)['updatePlannerFeed']['body']>;

const REGIONS_KEY = [...PLANNER_PREFIX, 'holiday-regions'] as const;

function exportLinkKey(person: PlannerPerson, collectionId: string): readonly unknown[] {
  return [...PLANNER_PREFIX, 'export-link', person, collectionId];
}

export function useHolidayRegions(enabled: boolean): UseQueryResult<PlannerHolidayRegion[]> {
  return useScreenQuery({
    queryKey: REGIONS_KEY,
    queryFn: readPlannerHolidayRegions,
    staleTime: Infinity,
    enabled,
  });
}

export function useExportLink(
  person: PlannerPerson,
  collectionId: string,
  enabled: boolean,
): UseQueryResult<PlannerExportLink | null> {
  return useScreenQuery({
    queryKey: exportLinkKey(person, collectionId),
    queryFn: () => readPlannerExportLink(apiPerson(person), collectionId),
    enabled,
  });
}

export function useHomeCountry(): string | null {
  const pref = useRegionPref();
  return useMemo(() => {
    const resolved = resolveRegion(pref, deviceRegionSource());
    return resolved.kind === 'undetected' ? null : resolved.region;
  }, [pref]);
}

export interface FeedWrites {
  readonly add: (body: PlannerFeedCreate) => Promise<PlannerCollectionRow>;
  readonly change: (collectionId: string, body: FeedChanges) => Promise<PlannerCollectionRow>;
  readonly refresh: (collectionId: string) => Promise<PlannerCollectionRow>;
  readonly publish: (collectionId: string) => Promise<PlannerExportLink>;
  readonly unpublish: (collectionId: string) => Promise<void>;
  readonly importFile: (collectionId: string, file: Blob) => Promise<PlannerImportResult>;
  readonly exportCalendar: (collectionId: string) => Promise<Uint8Array>;
}

function linkWrites(
  client: QueryClient,
  person: PlannerPerson,
): Pick<FeedWrites, 'publish' | 'unpublish'> {
  const who = apiPerson(person);
  return {
    publish: async (collectionId): Promise<PlannerExportLink> => {
      const link = await createPlannerExportLink(who, collectionId);
      client.setQueryData(exportLinkKey(person, collectionId), link);
      return link;
    },
    unpublish: async (collectionId): Promise<void> => {
      await deletePlannerExportLink(who, collectionId);
      client.setQueryData(exportLinkKey(person, collectionId), null);
    },
  };
}

export function feedWrites(client: QueryClient, person: PlannerPerson): FeedWrites {
  const who = apiPerson(person);
  return {
    add: (body) => createPlannerFeed(who, body),
    change: (collectionId, body) => updatePlannerFeed(who, collectionId, body),
    refresh: (collectionId) => refreshPlannerFeed(who, collectionId),
    ...linkWrites(client, person),
    importFile: (collectionId, file) =>
      importPlannerCalendar(who, collectionId, file, { onProgress: () => undefined }),
    exportCalendar: (collectionId) => exportPlannerCalendar(who, collectionId),
  };
}

export function usePlannerFeeds(person: PlannerPerson): FeedWrites {
  const client = useQueryClient();
  return useMemo(() => feedWrites(client, person), [client, person]);
}
