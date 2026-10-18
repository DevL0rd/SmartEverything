import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyAction, ShellyDevice, ShellyResources } from '@smarteverything/shelly';
import { Button } from '../../components/button';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { ActionRunner, useActionDraft, type ActionDraft } from './action-runner';
import { editorSchema, propertiesOf } from './action-schema';
import { recordOf, type JsonRecord } from './form-model';
import { OperationFeedback } from './operation-feedback';
import { actionAvailable } from './presence-operation';
import type { ResourceState } from './resource-data';
import { usePresenceOperation } from './use-presence-operation';
import { usePresenceSelection } from './use-presence-selection';
import { background } from '@smarteverything/logging';

export interface ResourceItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly initial: JsonRecord;
  readonly fixed: JsonRecord;
}

export interface ResourceActions {
  readonly create: ShellyAction;
  readonly update: ShellyAction;
  readonly remove: ShellyAction;
  readonly wrap?: string;
}

export interface ItemEditorContext {
  readonly sensor: ShellyDevice;
  readonly item: ResourceItem;
  readonly close: () => void;
  readonly reload: () => void;
}

type ResourceHelpers = (draft: ActionDraft, resources: ShellyResources) => ReactNode;

interface EditorProps {
  readonly sensor: ShellyDevice;
  readonly actions: ResourceActions;
  readonly item: ResourceItem | null;
  readonly blank: JsonRecord;
  readonly resources: ShellyResources;
  readonly helpers: ResourceHelpers | undefined;
  readonly finished: () => void;
  readonly close: () => void;
}

export interface ResourceListProps {
  readonly sensor: ShellyDevice;
  readonly title: string;
  readonly addLabel: string;
  readonly items: readonly ResourceItem[];
  readonly state: ResourceState;
  readonly actions: ResourceActions;
  readonly blank: JsonRecord;
  readonly helpers?: ResourceHelpers | undefined;
  readonly editor?: ((context: ItemEditorContext) => ReactNode) | undefined;
}

export function picked(action: ShellyAction, wrap: string, row: unknown): JsonRecord {
  const known = Object.keys(propertiesOf(editorSchema(action, wrap, [])));
  return Object.fromEntries(
    Object.entries(recordOf(row) ?? {}).filter(([name]) => known.includes(name)),
  );
}

export function RemoveButton({
  sensor,
  remove,
  params,
  done,
}: {
  readonly sensor: ShellyDevice;
  readonly remove: ShellyAction;
  readonly params: JsonRecord;
  readonly done: () => void;
}): ReactNode {
  const operation = usePresenceOperation(sensor);
  return (
    <View className="gap-2">
      <OperationFeedback operation={operation} />
      <Button
        label="Delete"
        variant="destructive"
        loading={operation.busy}
        disabled={!actionAvailable(sensor, remove)}
        onPress={() => {
          background(
            operation.run({ action: remove, params }).then((removed) => {
              if (removed) done();
            }),
            'operation.run_failed',
          );
        }}
      />
    </View>
  );
}

function Editor({
  sensor,
  actions,
  item,
  blank,
  resources,
  helpers,
  finished,
  close,
}: EditorProps): ReactNode {
  const draft = useActionDraft(item?.initial ?? blank);
  return (
    <View className="gap-section-gap">
      <ActionRunner
        sensor={sensor}
        action={item === null ? actions.create : actions.update}
        draft={draft}
        close={close}
        fixed={item?.fixed ?? {}}
        done={finished}
        before={helpers?.(draft, resources)}
        {...(actions.wrap === undefined ? {} : { wrap: actions.wrap })}
      />
      {item === null ? null : (
        <RemoveButton sensor={sensor} remove={actions.remove} params={item.fixed} done={finished} />
      )}
    </View>
  );
}

function Items({
  title,
  addLabel,
  items,
  state,
  creatable,
  choose,
}: {
  readonly title: string;
  readonly addLabel: string;
  readonly items: readonly ResourceItem[];
  readonly state: ResourceState;
  readonly creatable: boolean;
  readonly choose: (id: string) => void;
}): ReactNode {
  return (
    <View className="gap-section-gap">
      {state.error === null ? null : <Text tone="critical">{state.error}</Text>}
      {state.loading ? <Text tone="variant">Loading from the device…</Text> : null}
      <List title={title}>
        {items.map((item) => (
          <NavRow
            key={item.id}
            title={item.title}
            subtitle={item.subtitle}
            onPress={() => {
              choose(item.id);
            }}
          />
        ))}
      </List>
      {!state.loading && items.length === 0 ? <Text tone="variant">Nothing here yet.</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={addLabel}
          icon="plus"
          variant="tonal"
          disabled={!creatable}
          onPress={() => {
            choose('new');
          }}
        />
        <Button label="Reload" variant="text" onPress={state.reload} />
      </View>
    </View>
  );
}

export function ResourceList({
  sensor,
  title,
  addLabel,
  items,
  state,
  actions,
  blank,
  helpers,
  editor,
}: ResourceListProps): ReactNode {
  const [selected, select] = usePresenceSelection('item');
  const close = (): void => {
    select(null);
  };
  const item = items.find((entry) => entry.id === selected) ?? null;
  const finished = (): void => {
    state.reload();
    close();
  };
  if (selected === 'new' || (item !== null && editor === undefined))
    return (
      <Editor
        key={item?.id ?? 'new'}
        sensor={sensor}
        actions={actions}
        item={item}
        blank={blank}
        resources={state.resources}
        helpers={helpers}
        finished={finished}
        close={close}
      />
    );
  if (item !== null && editor !== undefined)
    return editor({ sensor, item, close, reload: state.reload });
  return (
    <Items
      title={title}
      addLabel={addLabel}
      items={items}
      state={state}
      creatable={actionAvailable(sensor, actions.create)}
      choose={select}
    />
  );
}
