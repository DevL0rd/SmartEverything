import type { PlannerItemRow, PlannerOccurrenceRow, PlannerRange } from '@smarteverything/domain';
import type { PlannerItemScope } from '../store/repositories/planner-items';
import type { Store } from '../store/store';
import { isoOf } from './instants';
import { expandOccurrences, type ExpandWindow } from './occurrences';
import { itemRoleOf, type PlannerAccessStore } from './sharing/visibility';

export type PlannerReader = Pick<Store, 'plannerItems' | 'plannerOccurrences'>;

export type RangeReader = PlannerReader & PlannerAccessStore;

export interface LoadedWindow {
  readonly items: readonly PlannerItemRow[];
  readonly stored: readonly PlannerOccurrenceRow[];
}

export interface RangeQuery {
  readonly profileId: string;
  readonly window: ExpandWindow;
  readonly now: Temporal.Instant;
  readonly collectionIds?: readonly string[] | undefined;
}

const DAY = { hours: 24 } as const;

function uniqueById(items: readonly PlannerItemRow[]): readonly PlannerItemRow[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function candidates(
  store: PlannerReader,
  profileId: string,
  window: ExpandWindow,
  scope: PlannerItemScope,
): PlannerItemRow[] {
  const wide = { from: isoOf(window.from.subtract(DAY)), to: isoOf(window.to.add(DAY)) };
  const undatedDue = store.plannerItems
    .list(profileId, { kind: 'task', scope })
    .filter((item) => item.start_local === null && item.due_at === null && item.due_date !== null);
  return [
    ...store.plannerItems.range(profileId, wide, scope),
    ...store.plannerItems.due(profileId, wide, scope),
    ...undatedDue,
  ];
}

export function loadWindow(
  store: PlannerReader,
  profileId: string,
  window: ExpandWindow,
  scope: PlannerItemScope = 'owned',
): LoadedWindow {
  const found = uniqueById(candidates(store, profileId, window, scope));
  const overrides = found
    .filter((item) => item.rrule !== null)
    .flatMap((master) => store.plannerItems.overrides(master.id, master.profile_id));
  const items = uniqueById([...found, ...overrides]);
  return { items, stored: store.plannerOccurrences.forItems(items.map((item) => item.id)) };
}

function involvedOnly(store: PlannerAccessStore, profileId: string, item: PlannerItemRow): boolean {
  const role = itemRoleOf(store, profileId, item);
  return role === 'guest' || role === 'assignee';
}

export function composeRange(store: RangeReader, query: RangeQuery): PlannerRange {
  const loaded = loadWindow(store, query.profileId, query.window, 'shown');
  const wanted = query.collectionIds;
  const items =
    wanted === undefined
      ? loaded.items
      : loaded.items.filter(
          (item) =>
            wanted.includes(item.collection_id) || involvedOnly(store, query.profileId, item),
        );
  return {
    from: isoOf(query.window.from),
    to: isoOf(query.window.to),
    occurrences: expandOccurrences({
      items,
      stored: loaded.stored,
      window: query.window,
      now: query.now,
    }),
  };
}
