import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { AiMemory, AiMemoryList, AiMemoryScope } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Badge } from '../../../components/badge';
import { ChoiceChip } from '../../../components/choice-chip';
import { confirm } from '../../../components/confirm-store';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { ActionRow } from '../../../components/rows';
import { List, SectionAction } from '../../../components/section';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { plural } from '../../../format/text';
import { relative } from '../../../format/time';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { useMinuteOf } from '../../../store/clock';
import { useIsOwner } from '../../../store/selectors';
import { useMemoryActions, type MemoryActions } from './memory-data';
import {
  KIND_LABEL,
  MEMORY_ORDERS,
  mayChange,
  memoriesIn,
  SCOPE_COPY,
  type MemoryOrder,
} from './memory-model';

type Editing = { readonly kind: 'add' } | { readonly kind: 'edit'; readonly memory: AiMemory };

function editRequest(
  scope: AiMemoryScope,
  editing: Editing,
  actions: MemoryActions,
): TextEditRequest {
  const adding = editing.kind === 'add';
  return {
    id: adding ? `memory-add-${scope}` : `memory-${editing.memory.id}`,
    title: adding ? 'Add a memory' : 'Edit memory',
    label: 'What the AI should remember',
    initial: adding ? '' : editing.memory.text,
    placeholder: 'For example: prefers the lights warm in the evening',
    confirmLabel: adding ? 'Add' : 'Save',
    maxLength: Number.POSITIVE_INFINITY,
    multiline: true,
    save: (text) => (adding ? actions.add(scope, text) : actions.change(editing.memory, text)),
  };
}

async function removeOne(memory: AiMemory, actions: MemoryActions): Promise<void> {
  const sure = await confirm({
    title: 'Delete this memory?',
    body: memory.text,
    confirmLabel: 'Delete',
    tone: 'destructive',
  });
  if (!sure) return;
  try {
    await actions.remove(memory);
    notify({ message: 'Memory deleted', tone: 'positive' });
  } catch (error) {
    notify({ message: 'Memory was not deleted', error, tone: 'critical' });
  }
}

async function forgetScope(scope: AiMemoryScope, actions: MemoryActions): Promise<void> {
  const copy = SCOPE_COPY[scope];
  const sure = await confirm({
    title: copy.forgetTitle,
    body: copy.forgetBody,
    confirmLabel: 'Forget everything',
    tone: 'destructive',
  });
  if (!sure) return;
  try {
    const removed = await actions.forget(scope);
    notify({ message: `Forgot ${plural(removed, 'memory', 'memories')}`, tone: 'positive' });
  } catch (error) {
    notify({ message: 'Memories were not forgotten', error, tone: 'critical' });
  }
}

function MemoryRow({
  memory,
  editable,
  onEdit,
  onDelete,
}: {
  readonly memory: AiMemory;
  readonly editable: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  const ago = useMinuteOf((now) => relative(memory.updated_at, now));
  const body = (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text variant="body">{memory.text}</Text>
      <View
        className="flex-row flex-wrap items-center gap-2"
        accessible
        accessibilityLabel={`${KIND_LABEL[memory.kind]}, importance ${String(memory.importance)} of 100, updated ${ago}`}
      >
        <Badge label={String(memory.importance)} />
        <Text variant="caption" tone="variant">
          {`${KIND_LABEL[memory.kind]} · Updated ${ago}`}
        </Text>
      </View>
    </View>
  );
  return (
    <View className="min-h-row-h-2 flex-row items-center gap-2 py-2 pl-4 pr-2">
      {editable ? (
        <Pressable
          className="min-w-0 flex-1"
          accessibilityRole="button"
          accessibilityLabel="Edit memory"
          onPress={onEdit}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {editable ? (
        <IconButton icon="trash" label="Delete memory" tone="critical" onPress={onDelete} />
      ) : null}
    </View>
  );
}

function rowsOf(
  memories: readonly AiMemory[],
  editable: boolean,
  actions: MemoryActions,
  onEdit: (memory: AiMemory) => void,
): ReactNode {
  return memories.map((memory) => (
    <MemoryRow
      key={memory.id}
      memory={memory}
      editable={editable}
      onEdit={() => {
        onEdit(memory);
      }}
      onDelete={() => {
        background(removeOne(memory, actions), 'memory.remove_failed');
      }}
    />
  ));
}

function addAction(editable: boolean, onAdd: () => void): { readonly action?: ReactNode } {
  return editable ? { action: <SectionAction label="Add" onPress={onAdd} /> } : {};
}

function ForgetRow({
  scope,
  actions,
}: {
  readonly scope: AiMemoryScope;
  readonly actions: MemoryActions;
}): ReactNode {
  return (
    <ActionRow
      title="Forget everything"
      icon="trash"
      destructive
      onPress={() => {
        background(forgetScope(scope, actions), 'memory.forget_failed');
      }}
    />
  );
}

function SortRow({
  order,
  onChange,
}: {
  readonly order: MemoryOrder;
  readonly onChange: (order: MemoryOrder) => void;
}): ReactNode {
  return (
    <View className="min-h-row-h flex-row items-center justify-between gap-2 px-4">
      <Text variant="label" tone="variant">
        Sort memories
      </Text>
      <ChoiceChip
        label="Sort memories"
        options={MEMORY_ORDERS}
        value={order}
        all="importance"
        onChange={onChange}
      />
    </View>
  );
}

export function MemorySection({
  scope,
  list,
}: {
  readonly scope: AiMemoryScope;
  readonly list: AiMemoryList;
}): ReactNode {
  const copy = SCOPE_COPY[scope];
  const editable = mayChange(scope, useIsOwner());
  const actions = useMemoryActions();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [order, setOrder] = useState<MemoryOrder>('importance');
  const memories = useMemo(() => memoriesIn(list, scope, order), [list, scope, order]);
  return (
    <>
      <List
        inset
        title={copy.title}
        caption={plural(memories.length, 'memory', 'memories')}
        footer={copy.footer}
        {...addAction(editable, () => {
          setEditing({ kind: 'add' });
        })}
      >
        <SortRow order={order} onChange={setOrder} />
        {memories.length === 0 ? (
          <ListRow title={copy.empty} icon="lightbulb" />
        ) : (
          rowsOf(memories, editable, actions, (memory) => {
            setEditing({ kind: 'edit', memory });
          })
        )}
        {editable && memories.length > 0 ? <ForgetRow scope={scope} actions={actions} /> : null}
      </List>
      <TextEditSheet
        request={editing === null ? null : editRequest(scope, editing, actions)}
        onClose={() => {
          setEditing(null);
        }}
      />
    </>
  );
}
