import type { PlannerItemRow, PlannerItemScope } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { notify } from '../../../components/toast-store';
import { useSettings } from '../../../store/selectors';
import { usePlannerWrites, type PlannerPerson, type PlannerWrites } from '../data';
import { useItemSaves, withoutSent } from '../data/item-saves';
import { itemWith, type ItemChange } from '../data/writes';
import { itemAtDay, occurrenceDayOf, seriesChangesOf } from './item-history';
import {
  RepeatScopeBar,
  patchOf,
  scopeBarShown,
  scopeChoicesOf,
  scopeIn,
  type ItemChanges,
} from './repeat-scope-bar';

export interface ItemTarget {
  readonly itemId: string;
  readonly occurrenceKey: string | null;
  readonly person: PlannerPerson;
}

export interface ItemEditor {
  readonly shown: PlannerItemRow;
  readonly change: (changes: ItemChanges) => void;
  readonly bar: ReactNode;
}

function failed(error: unknown): void {
  notify({ message: 'Couldn’t save that change', error, tone: 'critical' });
}

interface Sender {
  readonly busy: boolean;
  readonly send: (change: ItemChange, sent: ItemChanges) => void;
}

function useSend(
  writes: PlannerWrites,
  item: PlannerItemRow,
  setChanges: (update: (current: ItemChanges) => ItemChanges) => void,
): Sender {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    send: (change, sent): void => {
      setBusy(true);
      background(
        writes
          .updateItem(item, change)
          .then(() => {
            setChanges((current) => withoutSent(current, sent));
          })
          .catch(failed)
          .finally(() => {
            setBusy(false);
          }),
        'planner.item_save_failed',
      );
    },
  };
}

function scopedChanges(
  scope: PlannerItemScope,
  changes: ItemChanges,
  item: PlannerItemRow,
  day: string | null,
): ItemChanges {
  return scope === 'all' ? seriesChangesOf(changes, item, day) : changes;
}

function useSavedItem(
  item: PlannerItemRow,
  person: PlannerPerson,
): {
  readonly saved: PlannerItemRow;
  readonly save: (changes: ItemChanges) => void;
} {
  const { unsaved, save } = useItemSaves(person, item.id);
  return { saved: unsaved === null ? item : itemWith(item, { changes: unsaved }), save };
}

export function useItemEditor(
  item: PlannerItemRow,
  target: ItemTarget,
  offline: boolean,
): ItemEditor {
  const writes = usePlannerWrites(target.person);
  const timeZone = useSettings().time_zone;
  const [changes, setChanges] = useState<ItemChanges>({});
  const [chosen, setScope] = useState<PlannerItemScope>('this');
  const { saved, save } = useSavedItem(item, target.person);
  const { busy, send } = useSend(writes, item, setChanges);
  const recurring = item.rrule !== null;
  const day = recurring ? occurrenceDayOf(target.occurrenceKey, timeZone) : null;
  const choices = scopeChoicesOf({ occurrenceKey: target.occurrenceKey, changes });
  const scope = scopeIn(chosen, choices);
  const change = (next: ItemChanges): void => {
    if (recurring) setChanges((current) => ({ ...current, ...next }));
    else save(next);
  };
  const bar = scopeBarShown(item, changes) ? (
    <RepeatScopeBar
      kind={item.kind}
      choices={choices}
      scope={scope}
      onScope={setScope}
      onSave={() => {
        const sent = scopedChanges(scope, changes, item, day);
        send(patchOf(scope, target.occurrenceKey, sent), changes);
      }}
      onCancel={() => {
        setChanges({});
      }}
      busy={busy}
      disabled={offline}
    />
  ) : null;
  const shown = recurring ? itemWith(itemAtDay(item, day), { changes }) : saved;
  return { shown, change, bar };
}

export function itemIn(items: readonly PlannerItemRow[], itemId: string): PlannerItemRow | null {
  return items.find((item) => item.id === itemId && item.deleted_at === null) ?? null;
}
