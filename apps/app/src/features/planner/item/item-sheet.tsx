import type { PlannerItemRow, PlannerItemScope } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { EmptyState } from '../../../components/empty-state';
import { Sheet } from '../../../components/sheet';
import { notify } from '../../../components/toast-store';
import { useHubOffline } from '../../clock';
import { usePlannerWrites, type PlannerPerson, type PlannerWrites } from '../data';
import { useVisibleItem } from '../data/assignment';
import { itemWith, type ItemChange } from '../data/writes';
import { ItemBody } from './item-body';
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
  readonly busy: boolean;
}

function failed(error: unknown): void {
  notify({ message: 'Couldn’t save that change', error, tone: 'critical' });
}

interface Sender {
  readonly busy: boolean;
  readonly send: (change: ItemChange, then: () => void) => void;
}

function useSend(writes: PlannerWrites, item: PlannerItemRow): Sender {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    send: (change, then): void => {
      setBusy(true);
      background(
        writes
          .updateItem(item, change)
          .then(then)
          .catch(failed)
          .finally(() => {
            setBusy(false);
          }),
        'planner.item_save_failed',
      );
    },
  };
}

export function useItemEditor(
  item: PlannerItemRow,
  target: ItemTarget,
  offline: boolean,
): ItemEditor {
  const writes = usePlannerWrites(target.person);
  const [changes, setChanges] = useState<ItemChanges>({});
  const [chosen, setScope] = useState<PlannerItemScope>('this');
  const { busy, send } = useSend(writes, item);
  const recurring = item.rrule !== null;
  const choices = scopeChoicesOf({ occurrenceKey: target.occurrenceKey, changes });
  const scope = scopeIn(chosen, choices);
  const clear = (): void => {
    setChanges({});
  };
  const change = (next: ItemChanges): void => {
    if (recurring) setChanges((current) => ({ ...current, ...next }));
    else send(patchOf('all', null, next), clear);
  };
  const bar = scopeBarShown(item, changes) ? (
    <RepeatScopeBar
      kind={item.kind}
      choices={choices}
      scope={scope}
      onScope={setScope}
      onSave={() => {
        send(patchOf(scope, target.occurrenceKey, changes), clear);
      }}
      onCancel={clear}
      busy={busy}
      disabled={offline}
    />
  ) : null;
  return { shown: recurring ? itemWith(item, { changes }) : item, change, bar, busy };
}

export interface ItemSheetProps extends ItemTarget {
  readonly open: boolean;
  readonly onClose: () => void;
}

function OpenItemSheet(props: ItemSheetProps & { readonly item: PlannerItemRow }): ReactNode {
  const offline = useHubOffline();
  const editor = useItemEditor(props.item, props, offline);
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={editor.shown.title}
      detents={['half', 'full']}
      kind="dialog"
      wide
      {...(editor.bar === null ? {} : { footer: editor.bar })}
    >
      <ItemBody
        item={props.item}
        editor={editor}
        target={props}
        offline={offline}
        onClose={props.onClose}
      />
    </Sheet>
  );
}

export function itemIn(items: readonly PlannerItemRow[], itemId: string): PlannerItemRow | null {
  return items.find((item) => item.id === itemId && item.deleted_at === null) ?? null;
}

export function ItemSheet(props: ItemSheetProps): ReactNode {
  const item = useVisibleItem(props.person, props.itemId);
  if (item === null) {
    return (
      <Sheet open={props.open} onClose={props.onClose} label="Planner item" detents={['fit']}>
        <EmptyState
          icon="calendar"
          title="This item is gone"
          body="It was deleted, or it belongs to someone else."
        />
      </Sheet>
    );
  }
  return <OpenItemSheet key={item.id} {...props} item={item} />;
}
