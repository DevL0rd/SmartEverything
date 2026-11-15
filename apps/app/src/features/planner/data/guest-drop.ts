import type { PlannerGuestRow, PlannerItemRow, RowChange } from '@smarteverything/domain';
import { applyChange } from '../../../store/live-reducers';
import { rowsOf, type StoreState } from '../../../store/state';
import { seenBy } from './assignment';

type GuestChange = Extract<RowChange, { readonly table: 'planner_guests' }>;

function leftGuest(change: GuestChange, me: string | null): PlannerGuestRow | null {
  const row = change.oldRecord;
  if (change.operation !== 'DELETE' || row === null || me === null) return null;
  return row.kind === 'person' && row.profile_id === me ? row : null;
}

function dropItem(state: StoreState, item: PlannerItemRow): StoreState {
  const occurrences = rowsOf(state.tables.planner_occurrences).filter(
    (row) => row.item_id === item.id,
  );
  const withoutOccurrences = occurrences.reduce(
    (current, row) =>
      applyChange(current, {
        type: 'change',
        table: 'planner_occurrences',
        operation: 'DELETE',
        record: null,
        oldRecord: row,
      }),
    state,
  );
  return applyChange(withoutOccurrences, {
    type: 'change',
    table: 'planner_items',
    operation: 'DELETE',
    record: null,
    oldRecord: item,
  });
}

export function dropUninvitedItems(state: StoreState, change: GuestChange): StoreState {
  const me = state.session?.client.profile_id ?? null;
  const guest = leftGuest(change, me);
  if (guest === null) return state;
  const gone = rowsOf(state.tables.planner_items).filter(
    (item) =>
      (item.id === guest.item_id || item.series_id === guest.item_id) && !seenBy(state, item, me),
  );
  return gone.reduce(dropItem, state);
}
