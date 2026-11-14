import type {
  GoogleChoice,
  PlannerCollectionRow,
  PlannerItemRow,
  PlannerItemScope,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { useMinute } from '../../../store/clock';
import { useRows, useSettings } from '../../../store/selectors';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { useHubOffline } from '../../clock/frame/hub-status';
import {
  usePlannerCollections,
  usePlannerItems,
  usePlannerOccurrences,
  usePlannerWrites,
  type PlannerPerson,
  type PlannerWrites,
} from '../data';
import { itemWith, type ItemChange } from '../data/writes';
import { PriorityFlag, priorityOf } from '../tasks/priority-flag';
import { LIST_DOT } from './composer-tokens';
import {
  GoogleTitleLine,
  reminderCaptionOf,
  titleCaptionOf,
  useGoogleChoice,
  whenCaptionOf,
} from './google-captions';
import { ItemActions, reported } from './item-actions';
import { ItemFields } from './item-fields';
import { ItemTitle } from './item-title';
import {
  ItemHistory,
  itemHistoryOf,
  type FieldsToday,
  type ItemHistoryModel,
} from './item-history';
import { ItemNotes, ItemSteps, stepCreateOf, stepsOf, type StepView } from './item-steps';
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

const selectMe = (state: StoreState): string | null => state.session?.client.profile_id ?? null;

function usePersonName(profileId: string): string {
  const me = useStoreSelector(selectMe);
  const profiles = useRows('profiles');
  if (profileId === me) return 'You';
  return profiles.find((profile) => profile.id === profileId)?.name ?? 'Someone else';
}

function collectionIn(
  collections: readonly PlannerCollectionRow[],
  id: string,
): PlannerCollectionRow | null {
  return collections.find((row) => row.id === id) ?? null;
}

function ItemMeta({
  item,
  collection,
}: {
  readonly item: PlannerItemRow;
  readonly collection: PlannerCollectionRow | null;
}): ReactNode {
  const priority = priorityOf(item.priority);
  const source = item.google === null ? 'this hub' : 'Google';
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {collection === null ? null : (
        <View className="flex-row items-center gap-1.5 rounded-full bg-surface-3 px-2 py-0.5">
          <View className={cn('size-2 rounded-full', LIST_DOT[collection.colour])} />
          <Text variant="caption" tone="variant">
            {collection.name}
          </Text>
        </View>
      )}
      {priority === null ? null : <PriorityFlag priority={priority} />}
      <Text variant="footnote" tone="variant">
        {`${item.kind === 'event' ? 'Event' : 'Task'} · ${source}`}
      </Text>
    </View>
  );
}

export interface ItemBodyProps {
  readonly item: PlannerItemRow;
  readonly editor: ItemEditor;
  readonly target: ItemTarget;
  readonly offline: boolean;
  readonly onClose: () => void;
}

interface BodyData {
  readonly today: FieldsToday;
  readonly collections: readonly PlannerCollectionRow[];
  readonly collection: PlannerCollectionRow | null;
  readonly steps: readonly StepView[];
  readonly history: ItemHistoryModel;
  readonly choice: GoogleChoice | null;
  readonly personName: string;
}

function useBodyData(item: PlannerItemRow, person: PlannerPerson): BodyData {
  const timeZone = useSettings().time_zone;
  const now = useMinute();
  const collections = usePlannerCollections(person);
  const items = usePlannerItems(person);
  const occurrences = usePlannerOccurrences(person);
  const today = { now, timeZone };
  return {
    today,
    collections,
    collection: collectionIn(collections, item.collection_id),
    steps: stepsOf(items, occurrences, item.id),
    history: itemHistoryOf(occurrences, item.id, today),
    choice: useGoogleChoice(person, item),
    personName: usePersonName(item.profile_id),
  };
}

interface StepActions {
  readonly onDone: (step: StepView) => void;
  readonly onAdd: (title: string) => void;
}

function useStepActions(
  item: PlannerItemRow,
  steps: readonly StepView[],
  person: PlannerPerson,
): StepActions {
  const writes = usePlannerWrites(person);
  return {
    onDone: (step): void => {
      reported(writes.completeItem(step.item.id), 'Couldn’t tick that step');
    },
    onAdd: (title): void => {
      const body = stepCreateOf(item, steps, title);
      if (body !== null) reported(writes.createItem(body), 'Couldn’t add that step');
    },
  };
}

export function ItemBody({ item, editor, target, offline, onClose }: ItemBodyProps): ReactNode {
  const data = useBodyData(item, target.person);
  const stepActions = useStepActions(item, data.steps, target.person);
  const shown = editor.shown;
  const disabled = offline || editor.busy;
  return (
    <View className="gap-4 pb-2 pt-2">
      <ItemTitle
        key={shown.title}
        title={shown.title}
        disabled={disabled}
        onChange={editor.change}
      />
      <View className="gap-2">
        <ItemMeta item={shown} collection={collectionIn(data.collections, shown.collection_id)} />
        <GoogleTitleLine caption={titleCaptionOf(item, data.choice)} />
      </View>
      <ItemActions item={item} target={target} disabled={offline} onClose={onClose} />
      <ItemFields
        item={shown}
        collections={data.collections}
        today={data.today}
        personName={data.personName}
        whenCaption={whenCaptionOf(shown, data.collection)}
        reminderCaption={reminderCaptionOf(shown)}
        disabled={disabled}
        onChange={editor.change}
      />
      <ItemSteps steps={data.steps} disabled={offline} {...stepActions} />
      <ItemNotes
        key={shown.notes}
        notes={shown.notes}
        disabled={disabled}
        onChange={editor.change}
      />
      <ItemHistory model={data.history} />
    </View>
  );
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
  const item = itemIn(usePlannerItems(props.person), props.itemId);
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
