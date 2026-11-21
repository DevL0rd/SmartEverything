import {
  PLANNER_OCCURRENCE_SINGLE,
  type PlannerCollectionRow,
  type PlannerFeed,
  type PlannerGuestRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { Store } from '../../store/store';
import { applyEntries, type ApplyRequest, type ApplyTally } from '../ical/apply';
import type { IcalEntry } from '../ical/model';

type IcsFeed = Extract<PlannerFeed, { readonly kind: 'ics' }>;

export interface EntriesApply {
  readonly request: ApplyRequest;
  readonly entries: readonly IcalEntry[];
  readonly nowMs: number;
}

export interface FeedSource {
  readonly collection: PlannerCollectionRow;
  readonly allowPrivate: boolean;
}

export interface FeedAnswerApply {
  readonly collectionId: string;
  readonly url: string;
  readonly entries: readonly IcalEntry[];
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly nowMs: number;
}

export interface FeedTouch {
  readonly collectionId: string;
  readonly url: string;
  readonly failure: string | null;
  readonly nowMs: number;
}

export interface AppliedFeed {
  readonly row: PlannerCollectionRow;
  readonly counts: ApplyTally | null;
}

function currentFeed(
  store: Store,
  collectionId: string,
  url: string,
): { readonly row: PlannerCollectionRow; readonly feed: IcsFeed } | undefined {
  const row = store.plannerCollections.findAny(collectionId);
  const feed = row?.feed;
  return row !== undefined && feed?.kind === 'ics' && feed.url === url ? { row, feed } : undefined;
}

function appliedFeed(store: Store, input: FeedAnswerApply): AppliedFeed | null {
  const latest = currentFeed(store, input.collectionId, input.url);
  if (latest === undefined) return null;
  const counts = applyEntries(
    store,
    () => new Date(input.nowMs),
    {
      profileId: latest.row.profile_id,
      collectionId: latest.row.id,
      createdBy: 'feed',
      removeMissing: true,
    },
    input.entries,
  );
  const row = store.plannerCollections.update(latest.row.id, latest.row.profile_id, {
    feed: {
      ...latest.feed,
      etag: input.etag,
      last_modified: input.lastModified,
      fetched_at: new Date(input.nowMs).toISOString(),
      failure: null,
    },
  });
  return { row, counts };
}

function touchedFeed(store: Store, input: FeedTouch): PlannerCollectionRow | null {
  const latest = currentFeed(store, input.collectionId, input.url);
  if (latest === undefined) return null;
  const at = new Date(input.nowMs).toISOString();
  return store.plannerCollections.update(latest.row.id, latest.row.profile_id, {
    feed:
      input.failure === null
        ? { ...latest.feed, fetched_at: at, failure: null }
        : { ...latest.feed, failure: { at, reason: input.failure } },
  });
}

export interface ExportRows {
  readonly rows: readonly PlannerItemRow[];
  readonly guests: readonly PlannerGuestRow[];
  readonly completed: ReadonlyMap<string, string>;
}

function exportRows(
  store: Store,
  rows: readonly PlannerItemRow[],
  withGuests: boolean,
): ExportRows {
  const masters = rows.filter((row) => row.series_id === null);
  const events = masters.filter((row) => row.kind === 'event').map((row) => row.id);
  const tasks = masters.filter((row) => row.kind === 'task').map((row) => row.id);
  const completed = new Map<string, string>();
  const occurrences = tasks.length === 0 ? [] : store.plannerOccurrences.forItems(tasks);
  for (const row of occurrences) {
    if (row.occurrence_key === PLANNER_OCCURRENCE_SINGLE && row.completed_at !== null) {
      completed.set(row.item_id, row.completed_at);
    }
  }
  return {
    rows,
    guests: withGuests && events.length > 0 ? store.plannerGuests.forItems(events) : [],
    completed,
  };
}

function itemFamily(store: Store, item: PlannerItemRow): PlannerItemRow[] {
  const root = item.series_id === null ? item : store.plannerItems.anyById(item.series_id);
  return [
    root,
    ...store.plannerItems.children(root.id, root.profile_id),
    ...store.plannerItems.overrides(root.id, root.profile_id),
  ];
}

export const PLANNER_ICAL_READ_UNITS = {
  plannerExportCollection: storeUnit(
    (
      store,
      { collectionId, withGuests }: { readonly collectionId: string; readonly withGuests: boolean },
    ): ExportRows => exportRows(store, store.plannerItems.inCollection(collectionId), withGuests),
  ),
  plannerExportItem: storeUnit((store, { item }: { readonly item: PlannerItemRow }): ExportRows =>
    exportRows(store, itemFamily(store, item), true),
  ),
  plannerFeedSource: storeUnit(
    (store, { collectionId }: { readonly collectionId: string }): FeedSource => {
      const collection = store.plannerCollections.anyById(collectionId);
      return {
        collection,
        allowPrivate: store.personAccess.find(collection.profile_id)?.role === 'owner',
      };
    },
  ),
} as const;

export const PLANNER_ICAL_WRITE_UNITS = {
  plannerEntriesApply: storeUnit((store, { request, entries, nowMs }: EntriesApply): ApplyTally =>
    applyEntries(store, () => new Date(nowMs), request, entries),
  ),
  plannerFeedApply: storeUnit(appliedFeed),
  plannerFeedTouch: storeUnit(touchedFeed),
} as const;
