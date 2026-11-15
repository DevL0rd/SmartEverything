import type {
  GoogleChoice,
  PlannerCollectionRow,
  PlannerItemRow,
  ProfileRow,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { duration } from '../../../format/time';
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
import { TaskRuleCard } from './completion-rule-picker';
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
import type { ItemEditor, ItemTarget } from './item-editor';
import { ItemNotes, ItemSteps, stepCreateOf, stepsOf, type StepView } from './item-steps';
import type { ItemActionScope } from './item-menu-host';
import { ItemTitle } from './item-title';
import { PanelAttachments } from './panel-parts';
import { RsvpBar } from './rsvp-bar';
import { useItemOpen } from './selection';
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

export function useOwnerName(item: PlannerItemRow): string {
  return personNameOf(useRows('profiles'), item.profile_id, useStoreSelector(selectViewer));
}

function collectionIn(
  collections: readonly PlannerCollectionRow[],
  id: string,
): PlannerCollectionRow | null {
  return collections.find((row) => row.id === id) ?? null;
}

export interface ItemFocus {
  readonly part: 'when' | 'attach';
  readonly at: number;
}

function CollectionChip({ collection }: { readonly collection: PlannerCollectionRow }): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full bg-surface-3 px-2 py-0.5">
      <View className={cn('size-2 rounded-full', LIST_DOT[collection.colour])} />
      <Text variant="caption" tone="variant">
        {collection.name}
      </Text>
    </View>
  );
}

function StepOfLink({ parent }: { readonly parent: PlannerItemRow }): ReactNode {
  const open = useItemOpen(parent.id, 'single');
  return (
    <Interactive
      {...open}
      label={`Step of ${parent.title}, open it`}
      className="min-h-8 flex-row items-center gap-1.5 self-start rounded-sm"
      layerClassName="rounded-sm"
    >
      <Text variant="footnote" tone="variant">
        Step of
      </Text>
      <Text variant="footnote" tone="primary" numberOfLines={1} className="shrink">
        {parent.title}
      </Text>
    </Interactive>
  );
}

export interface ItemMetaProps {
  readonly item: PlannerItemRow;
  readonly collection: PlannerCollectionRow | null;
  readonly parent: PlannerItemRow | null;
  readonly inPanel: boolean;
  readonly facts: boolean;
}

function MetaFacts({ item }: { readonly item: PlannerItemRow }): ReactNode {
  return (
    <>
      {item.tags.map((tag) => (
        <Text key={tag} variant="footnote" tone="variant">
          {`#${tag}`}
        </Text>
      ))}
      {item.estimate_minutes === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular">
          {duration(item.estimate_minutes * 60)}
        </Text>
      )}
    </>
  );
}

export function ItemMeta({ item, collection, parent, inPanel, facts }: ItemMetaProps): ReactNode {
  const priority = priorityOf(item.priority);
  const source = item.google === null ? 'this hub' : 'Google';
  const kind = item.kind === 'event' ? 'Event' : 'Task';
  const row =
    !inPanel ||
    priority !== null ||
    (facts && (item.tags.length > 0 || item.estimate_minutes !== null));
  return (
    <View className="gap-1">
      {row ? (
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          {inPanel || collection === null ? null : <CollectionChip collection={collection} />}
          {priority === null ? null : <PriorityFlag priority={priority} />}
          {facts ? <MetaFacts item={item} /> : null}
          {inPanel ? null : (
            <Text variant="footnote" tone="variant">
              {`${kind} · ${source}`}
            </Text>
          )}
        </View>
      ) : null}
      {parent === null ? null : <StepOfLink parent={parent} />}
    </View>
  );
}

function parentIn(items: readonly PlannerItemRow[], item: PlannerItemRow): PlannerItemRow | null {
  if (item.parent_id === null) return null;
  return items.find((row) => row.id === item.parent_id) ?? null;
}

function ItemMetaLines({
  item,
  shown,
  data,
  inPanel,
}: {
  readonly item: PlannerItemRow;
  readonly shown: PlannerItemRow;
  readonly data: BodyData;
  readonly inPanel: boolean;
}): ReactNode {
  return (
    <View className="gap-2">
      <ItemMeta
        item={shown}
        collection={collectionIn(data.collections, shown.collection_id)}
        parent={parentIn(data.items, item)}
        inPanel={inPanel}
        facts={false}
      />
      <GoogleTitleLine caption={titleCaptionOf(item, data.choice)} />
    </View>
  );
}

export interface ItemBodyProps {
  readonly item: PlannerItemRow;
  readonly editor: ItemEditor;
  readonly target: ItemTarget;
  readonly scope: ItemActionScope;
  readonly focus: ItemFocus | null;
  readonly inPanel: boolean;
  readonly columns: boolean;
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
  steps,
  person,
  disabled,
}: {
  readonly item: PlannerItemRow;
  readonly steps: readonly StepView[];
  readonly person: PlannerPerson;
  readonly disabled: boolean;
}): ReactNode {
  const actions = useStepActions(item, steps, person);
  if (item.parent_id !== null || !canHoldSteps(item)) return null;
  return <ItemSteps steps={steps} disabled={disabled} {...actions} />;
}

export function ItemStepsFor({
  item,
  person,
  disabled,
}: {
  readonly item: PlannerItemRow;
  readonly person: PlannerPerson;
  readonly disabled: boolean;
}): ReactNode {
  const rows = useTaskRows(person, usePlannerItems(person), usePlannerOccurrences(person));
  const steps = stepsOf(rows.items, rows.occurrences, item.id);
  if (steps.length === 0) return null;
  return <StepsArea item={item} steps={steps} person={person} disabled={disabled} />;
}

export function useItemParent(item: PlannerItemRow, person: PlannerPerson): PlannerItemRow | null {
  const rows = useTaskRows(person, usePlannerItems(person), usePlannerOccurrences(person));
  return parentIn(rows.items, item);
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

function Columns({
  columns,
  main,
  side,
}: {
  readonly columns: boolean;
  readonly main: ReactNode;
  readonly side: ReactNode;
}): ReactNode {
  if (!columns) {
    return (
      <View className="gap-4 pb-2 pt-2">
        {main}
        {side}
      </View>
    );
  }
  return (
    <View className="flex-row items-start gap-6 pb-2 pt-2">
      <View className="min-w-0 flex-3 gap-4">{main}</View>
      <View className="min-w-0 flex-2 gap-4">{side}</View>
    </View>
  );
}

export function ItemBody(props: ItemBodyProps): ReactNode {
  const { item, editor, target, scope, focus, inPanel, offline, onClose } = props;
  const data = useBodyData(item, target.person);
  const lock = lockOf(useItemRole(target.person, item), item, offline || editor.busy);
  const shown = editor.shown;
  const personName = personNameOf(data.profiles, item.profile_id, data.viewer);
  const focused = focus === null ? 'none' : String(focus.at);
  const main = (
    <>
      <ItemTitle
        key={shown.title}
        title={shown.title}
        disabled={lock.fields}
        onChange={editor.change}
      />
      <ItemMetaLines item={item} shown={shown} data={data} inPanel={inPanel} />
      <RsvpBar item={item} person={target.person} disabled={offline} />
      <ItemActions
        item={item}
        target={target}
        scope={scope}
        disabled={lock.actions}
        onClose={onClose}
      />
      <ItemFields
        key={`fields-${focused}`}
        item={shown}
        collections={data.collections}
        today={data.today}
        personName={personName}
        profiles={data.profiles}
        me={data.me}
        whenCaption={whenCaptionOf(shown, data.collection)}
        reminderCaption={reminderCaptionOf(shown)}
        openWhen={focus?.part === 'when'}
        disabled={lock.fields}
        onChange={editor.change}
      />
      <TaskRuleCard
        item={shown}
        person={target.person}
        personName={personName}
        disabled={lock.fields}
        onChange={editor.change}
      />
      <PanelAttachments
        key={`attach-${focused}`}
        item={shown}
        disabled={lock.fields}
        picking={focus?.part === 'attach'}
        onChange={editor.change}
      />
    </>
  );
  const side = (
    <>
      <StepsArea item={item} steps={data.steps} person={target.person} disabled={offline} />
      {item.kind === 'event' ? (
        <ItemGuests item={item} person={target.person} disabled={offline} />
      ) : null}
      <ItemNotes
        key={shown.notes}
        notes={shown.notes}
        disabled={lock.notes}
        onChange={editor.change}
      />
      <ItemHistory model={data.history} />
    </>
  );
  return <Columns columns={props.columns} main={main} side={side} />;
}
