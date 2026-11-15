import type {
  GoogleChoice,
  PlannerCollectionRow,
  PlannerItemRow,
  ProfileRow,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useMinute } from '../../../store/clock';
import { useRows, useSettings } from '../../../store/selectors';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import {
  usePlannerItems,
  usePlannerOccurrences,
  usePlannerWrites,
  type PlannerPerson,
} from '../data';
import {
  useItemCollections,
  useItemRole,
  usePlannerProfile,
  useTaskRows,
  type ItemRole,
} from '../data/assignment';
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
import { ItemGuests } from './item-guests';
import {
  ItemHistory,
  itemHistoryOf,
  type FieldsToday,
  type ItemHistoryModel,
} from './item-history';
import type { ItemEditor, ItemTarget } from './item-sheet';
import {
  ItemNotes,
  ItemSteps,
  StepOfRow,
  stepCreateOf,
  stepsOf,
  type StepView,
} from './item-steps';
import { ItemTitle } from './item-title';
import { RsvpBar } from './rsvp-bar';
import { OUTDENT_CHANGE, canHoldSteps, type StepMove } from './steps-model';

const selectViewer = (state: StoreState): string | null => state.session?.client.profile_id ?? null;

function personNameOf(
  profiles: readonly ProfileRow[],
  profileId: string,
  me: string | null,
): string {
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
  readonly items: readonly PlannerItemRow[];
  readonly steps: readonly StepView[];
  readonly history: ItemHistoryModel;
  readonly choice: GoogleChoice | null;
  readonly profiles: readonly ProfileRow[];
  readonly me: string | null;
  readonly viewer: string | null;
}

function useBodyData(item: PlannerItemRow, person: PlannerPerson): BodyData {
  const timeZone = useSettings().time_zone;
  const now = useMinute();
  const { writable, current } = useItemCollections(person, item.collection_id);
  const collections =
    current === null || writable.includes(current) ? writable : [current, ...writable];
  const rows = useTaskRows(person, usePlannerItems(person), usePlannerOccurrences(person));
  const today = { now, timeZone };
  return {
    today,
    collections,
    collection: current,
    items: rows.items,
    steps: stepsOf(rows.items, rows.occurrences, item.id),
    history: itemHistoryOf(rows.occurrences, item.id, today),
    choice: useGoogleChoice(person, item),
    profiles: useRows('profiles'),
    me: usePlannerProfile(person),
    viewer: useStoreSelector(selectViewer),
  };
}

interface StepActions {
  readonly onDone: (step: StepView) => void;
  readonly onAdd: (title: string) => void;
  readonly onMove: (move: StepMove) => void;
  readonly onOutdent: (step: StepView) => void;
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
    onMove: (move): void => {
      const step = steps.find((one) => one.item.id === move.itemId);
      if (step === undefined) return;
      reported(
        writes.updateItem(step.item, { changes: { position: move.position } }),
        'Couldn’t move that step',
      );
    },
    onOutdent: (step): void => {
      reported(
        writes.updateItem(step.item, { changes: OUTDENT_CHANGE }),
        'Couldn’t make that its own task',
      );
    },
  };
}

function StepsArea({
  item,
  data,
  person,
  disabled,
}: {
  readonly item: PlannerItemRow;
  readonly data: BodyData;
  readonly person: PlannerPerson;
  readonly disabled: boolean;
}): ReactNode {
  const actions = useStepActions(item, data.steps, person);
  const parent =
    item.parent_id === null ? null : (data.items.find((row) => row.id === item.parent_id) ?? null);
  if (parent !== null) {
    return (
      <StepOfRow
        parent={parent}
        disabled={disabled}
        onOutdent={() => {
          actions.onOutdent({ item, done: item.status === 'done' });
        }}
      />
    );
  }
  if (!canHoldSteps(item)) return null;
  return <ItemSteps steps={data.steps} disabled={disabled} {...actions} />;
}

export interface ItemLock {
  readonly fields: boolean;
  readonly notes: boolean;
  readonly actions: boolean;
}

export function lockOf(role: ItemRole | null, item: PlannerItemRow, busy: boolean): ItemLock {
  const readOnly = role === null || role === 'view' || role === 'guest';
  const assignedTask = role === 'assignee' && item.parent_id === null;
  return {
    fields: busy || readOnly || assignedTask,
    notes: busy || readOnly,
    actions: busy || readOnly,
  };
}

export function ItemBody({ item, editor, target, offline, onClose }: ItemBodyProps): ReactNode {
  const data = useBodyData(item, target.person);
  const lock = lockOf(useItemRole(target.person, item), item, offline || editor.busy);
  const shown = editor.shown;
  return (
    <View className="gap-4 pb-2 pt-2">
      <ItemTitle
        key={shown.title}
        title={shown.title}
        disabled={lock.fields}
        onChange={editor.change}
      />
      <View className="gap-2">
        <ItemMeta item={shown} collection={collectionIn(data.collections, shown.collection_id)} />
        <GoogleTitleLine caption={titleCaptionOf(item, data.choice)} />
      </View>
      <RsvpBar item={item} person={target.person} disabled={offline} />
      <ItemActions item={item} target={target} disabled={lock.actions} onClose={onClose} />
      <ItemFields
        item={shown}
        collections={data.collections}
        today={data.today}
        personName={personNameOf(data.profiles, item.profile_id, data.viewer)}
        profiles={data.profiles}
        me={data.me}
        whenCaption={whenCaptionOf(shown, data.collection)}
        reminderCaption={reminderCaptionOf(shown)}
        disabled={lock.fields}
        onChange={editor.change}
      />
      {item.kind === 'event' ? (
        <ItemGuests item={item} person={target.person} disabled={offline} />
      ) : null}
      <StepsArea item={item} data={data} person={target.person} disabled={offline} />
      <ItemNotes
        key={shown.notes}
        notes={shown.notes}
        disabled={lock.notes}
        onChange={editor.change}
      />
      <ItemHistory model={data.history} />
    </View>
  );
}
