import type {
  PlannerCollectionRow,
  PlannerDay,
  PlannerFreeSlot,
  PlannerItemRow,
  PlannerPreferences,
  PlannerRange,
  PlannerSearchPage,
  PlannerStats,
  PlannerStatsRange,
} from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import { composeDayFromStore } from '../day';
import { freeSlotsFromStore } from '../free-slots';
import { acceptProposal, rejectProposal } from '../proposals';
import { composeRange } from '../range';
import { searchPlanner } from '../search';
import { visibleCollections, writableCollections } from '../sharing/visibility';
import { sleepSpansOn } from '../sleep-nights';
import { composeStats } from '../stats';

export interface DayView {
  readonly profileId: string;
  readonly date: string;
  readonly timeZone: string;
  readonly nowMs: number;
  readonly preferences: PlannerPreferences;
}

export interface RangeView {
  readonly profileId: string;
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
  readonly nowMs: number;
  readonly collectionIds?: readonly string[] | undefined;
}

export interface StatsView {
  readonly profileId: string;
  readonly range: PlannerStatsRange;
  readonly timeZone: string;
  readonly nowMs: number;
}

export interface SearchView {
  readonly profileId: string;
  readonly text: string;
  readonly nowMs: number;
  readonly timeZone: string;
  readonly when: 'all' | 'upcoming' | 'past';
  readonly collectionIds?: readonly string[] | undefined;
  readonly kinds?: readonly PlannerItemRow['kind'][] | undefined;
  readonly cursor?: string | undefined;
}

export interface FreeSlotsView {
  readonly profileId: string;
  readonly from: string;
  readonly to: string;
  readonly minutes: number;
  readonly timeZone: string;
  readonly nowMs: number;
}

export interface Proposal {
  readonly profileId: string;
  readonly id: string;
}

function instantOf(ms: number): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(ms);
}

export const PLANNER_VIEW_READ_UNITS = {
  plannerVisibleCollections: storeUnit(
    (store, { profileId }: { readonly profileId: string }): PlannerCollectionRow[] =>
      visibleCollections(store, profileId),
  ),
  plannerWritableCollections: storeUnit(
    (store, { profileId }: { readonly profileId: string }): PlannerCollectionRow[] =>
      writableCollections(store, profileId),
  ),
  plannerFreeSlotsView: storeUnit(
    (store, { from, to, nowMs, ...query }: FreeSlotsView): PlannerFreeSlot[] => [
      ...freeSlotsFromStore(store, {
        ...query,
        from: Temporal.Instant.from(from),
        to: Temporal.Instant.from(to),
        now: instantOf(nowMs),
      }),
    ],
  ),
  plannerDayView: storeUnit(
    (store, { profileId, date, timeZone, nowMs, preferences }: DayView): PlannerDay =>
      composeDayFromStore(store, {
        profileId,
        date,
        timeZone,
        now: instantOf(nowMs),
        lastOpen: null,
        preferences,
        sleep: sleepSpansOn(store, profileId, date, timeZone),
        sessions: [],
      }),
  ),
  plannerRangeView: storeUnit(
    (store, { profileId, from, to, timeZone, nowMs, collectionIds }: RangeView): PlannerRange =>
      composeRange(store, {
        profileId,
        window: { from: Temporal.Instant.from(from), to: Temporal.Instant.from(to), timeZone },
        now: instantOf(nowMs),
        collectionIds,
      }),
  ),
  plannerStatsView: storeUnit(
    (store, { profileId, range, timeZone, nowMs }: StatsView): PlannerStats =>
      composeStats(store, { profileId, range, now: instantOf(nowMs), timeZone }),
  ),
  plannerSearchView: storeUnit((store, { nowMs, ...query }: SearchView): PlannerSearchPage =>
    searchPlanner(store, { ...query, now: instantOf(nowMs) }),
  ),
} as const;

export const PLANNER_VIEW_WRITE_UNITS = {
  plannerProposalAccept: storeUnit((store, { profileId, id }: Proposal): PlannerItemRow =>
    acceptProposal(store, profileId, id),
  ),
  plannerProposalReject: storeUnit((store, { profileId, id }: Proposal): void => {
    rejectProposal(store, profileId, id);
  }),
} as const;
