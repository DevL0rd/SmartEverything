import type { PlannerItemRow, PlannerOccurrenceRow, PlannerRange } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { isoOf } from './instants';
import { expandOccurrences, type ExpandWindow } from './occurrences';

export type PlannerReader = Pick<Store, 'plannerItems' | 'plannerOccurrences'>;

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
): PlannerItemRow[] {
  const wide = { from: isoOf(window.from.subtract(DAY)), to: isoOf(window.to.add(DAY)) };
  const undatedDue = store.plannerItems
    .list(profileId, { kind: 'task' })
    .filter((item) => item.start_local === null && item.due_at === null && item.due_date !== null);
  return [
    ...store.plannerItems.range(profileId, wide),
    ...store.plannerItems.due(profileId, wide),
    ...undatedDue,
  ];
}

export function loadWindow(
  store: PlannerReader,
  profileId: string,
  window: ExpandWindow,
): LoadedWindow {
  const found = uniqueById(candidates(store, profileId, window));
  const overrides = found
    .filter((item) => item.rrule !== null)
    .flatMap((master) => store.plannerItems.overrides(master.id, profileId));
  const items = uniqueById([...found, ...overrides]);
  return { items, stored: store.plannerOccurrences.forItems(items.map((item) => item.id)) };
}

export function composeRange(store: PlannerReader, query: RangeQuery): PlannerRange {
  const loaded = loadWindow(store, query.profileId, query.window);
  const wanted = query.collectionIds;
  const items =
    wanted === undefined
      ? loaded.items
      : loaded.items.filter((item) => wanted.includes(item.collection_id));
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
