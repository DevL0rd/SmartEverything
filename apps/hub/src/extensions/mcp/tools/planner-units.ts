import type {
  PlannerCollectionRow,
  PlannerItemCreate,
  PlannerItemRow,
} from '@smarteverything/domain';
import { instantsOf } from '../../../planner/instants';
import { resolveItem, visibleCollections } from '../../../planner/sharing/visibility';
import { storeUnit } from '../../../store/host/unit';
import type { Store } from '../../../store/store';

export interface ItemAsk {
  readonly profileId: string;
  readonly itemId: string;
}

export const MCP_PLANNER_TASKS_UNIT = storeUnit(
  (
    store,
    {
      profileId,
      collections,
    }: { readonly profileId: string; readonly collections?: readonly string[] | undefined },
  ) => ({
    collections: store.plannerCollections.list(profileId),
    tasks: store.plannerItems.list(profileId, {
      kind: 'task',
      statuses: ['open'],
      collectionIds: collections,
    }),
  }),
);

export const MCP_PLANNER_ITEM_UNIT = storeUnit((store, { profileId, itemId }: ItemAsk) => {
  const { item, role } = resolveItem(store, profileId, itemId, 'read');
  return { item, role, children: store.plannerItems.children(item.id, item.profile_id) };
});

export const MCP_PLANNER_GUESTS_UNIT = storeUnit((store, { profileId, itemId }: ItemAsk) => {
  const { item, role } = resolveItem(store, profileId, itemId, 'read');
  return {
    item_id: item.id,
    role,
    guests: store.plannerGuests.forItem(item.series_id ?? item.id),
  };
});

export const MCP_PLANNER_SHARING_UNIT = storeUnit((store, profileId: string) => {
  const owned = store.plannerCollections.list(profileId);
  return {
    shared_by_me: owned.flatMap((collection) => {
      const shares = store.plannerShares.forCollection(collection.id);
      return shares.length === 0 ? [] : [{ collection, shares }];
    }),
    shared_with_me: store.plannerShares.forProfile(profileId).flatMap((share) => {
      const collection = store.plannerCollections.findAny(share.collection_id);
      return collection === undefined ? [] : [{ collection, share }];
    }),
    family: store.plannerCollections.household(),
  };
});

export const MCP_PLANNER_VISIBLE_UNIT = storeUnit(
  (store, profileId: string): PlannerCollectionRow[] => [...visibleCollections(store, profileId)],
);

export const MCP_PLANNER_TIMERS_UNIT = storeUnit((store, profileId: string) => ({
  timers: store.plannerTimers.list(profileId),
  stopwatch: store.plannerStopwatch.find(profileId) ?? null,
}));

function nextPosition(positions: readonly { readonly position: number }[]): number {
  return positions.reduce((highest, row) => Math.max(highest, row.position + 1), 0);
}

function proposed(store: Store, profileId: string, draft: PlannerItemCreate): PlannerItemRow {
  store.plannerCollections.byId(draft.collection_id, profileId);
  return store.plannerItems.insert({
    ...draft,
    ...instantsOf(draft),
    position:
      draft.position ??
      nextPosition(store.plannerItems.list(profileId, { collectionIds: [draft.collection_id] })),
    profile_id: profileId,
    series_id: null,
    original_start: null,
    status: 'proposed',
    google: null,
    ical_uid: null,
    ical_sequence: 0,
    booking_page_id: null,
    created_by: 'ai',
  });
}

export const MCP_PLANNER_PROPOSE_UNIT = storeUnit(
  (
    store,
    {
      profileId,
      items,
    }: { readonly profileId: string; readonly items: readonly PlannerItemCreate[] },
  ): PlannerItemRow[] => items.map((draft) => proposed(store, profileId, draft)),
);
