import type { PlannerCollectionRow, PlannerSleep } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import { collectionOf, type FeedAccessNeed } from '../feeds/access';
import {
  resolveCollection,
  resolveItem,
  type ItemNeed,
  type ResolvedItem,
} from '../sharing/visibility';
import { readSleep, type SleepRange } from '../sleep-nights';

export const PLANNER_VISIBILITY_READ_UNITS = {
  plannerFeedCollection: storeUnit(
    (
      store,
      {
        profileId,
        collectionId,
        need,
      }: {
        readonly profileId: string;
        readonly collectionId: string;
        readonly need: FeedAccessNeed;
      },
    ): PlannerCollectionRow => collectionOf(store, profileId, collectionId, need),
  ),
  plannerSleepRead: storeUnit((store, range: SleepRange): PlannerSleep => readSleep(store, range)),
  plannerCollectionResolve: storeUnit(
    (
      store,
      {
        profileId,
        collectionId,
        need,
      }: {
        readonly profileId: string;
        readonly collectionId: string;
        readonly need: 'read' | 'write';
      },
    ): PlannerCollectionRow => resolveCollection(store, profileId, collectionId, need),
  ),
  plannerItemResolve: storeUnit(
    (
      store,
      {
        profileId,
        itemId,
        need,
      }: { readonly profileId: string; readonly itemId: string; readonly need: ItemNeed },
    ): ResolvedItem => resolveItem(store, profileId, itemId, need),
  ),
} as const;
