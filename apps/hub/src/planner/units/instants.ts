import type { PlannerItemRow } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { Store } from '../../store/store';
import { instantsOf, type PlannerInstants } from '../instants';

function differs(item: PlannerItemRow, instants: PlannerInstants): boolean {
  return (
    item.start !== instants.start ||
    item.end !== instants.end ||
    item.series_end !== instants.series_end
  );
}

function recomputed(store: Store): number {
  let changed = 0;
  for (const profile of store.profiles.list()) {
    for (const item of store.plannerItems.list(profile.id)) {
      const instants = instantsOf(item);
      if (!differs(item, instants)) continue;
      store.plannerItems.update(item.id, profile.id, instants);
      changed += 1;
    }
  }
  return changed;
}

export const PLANNER_INSTANT_WRITE_UNITS = {
  plannerRecomputeInstants: storeUnit((store, _input: Record<string, never>): number =>
    recomputed(store),
  ),
} as const;
