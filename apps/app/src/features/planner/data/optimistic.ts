import type {
  PlannerAlarmRow,
  PlannerCollectionRow,
  PlannerItemRow,
  PlannerOccurrenceRow,
} from '@smarteverything/domain';
import { liveRowAccess, liveRowEdit, rowEdit, type Edit } from '../../../store/optimistic';
import type { StoreState } from '../../../store/state';

export function itemEdit(previous: PlannerItemRow, next: PlannerItemRow | null): Edit {
  return liveRowEdit('planner_items', previous.id, previous, next);
}

export function alarmEdit(previous: PlannerAlarmRow, next: PlannerAlarmRow | null): Edit {
  return liveRowEdit('planner_alarms', previous.id, previous, next);
}

export function collectionEdit(
  previous: PlannerCollectionRow,
  next: PlannerCollectionRow | null,
): Edit {
  return liveRowEdit('planner_collections', previous.id, previous, next);
}

export function occurrenceEdit(
  state: StoreState,
  itemId: string,
  key: string,
  next: PlannerOccurrenceRow | null,
): Edit {
  const access = liveRowAccess(
    'planner_occurrences',
    (current) =>
      current.tables.planner_occurrences.rows.find(
        (row) => row.item_id === itemId && row.occurrence_key === key,
      ) ?? null,
  );
  return rowEdit(access, access.find(state), next);
}
