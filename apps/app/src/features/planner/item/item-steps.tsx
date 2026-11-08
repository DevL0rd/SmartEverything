import type {
  PlannerItemCreate,
  PlannerItemRow,
  PlannerOccurrenceRow,
} from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/checkbox';
import { Section } from '../../../components/section';
import { TextField } from '../../../components/text-field';
import { compareText } from '../../../format/text';
import type { ItemChanges } from './repeat-scope-bar';

export interface StepView {
  readonly item: PlannerItemRow;
  readonly done: boolean;
}

function byPosition(left: PlannerItemRow, right: PlannerItemRow): number {
  return left.position - right.position || compareText(left.created_at, right.created_at);
}

export function stepsOf(
  items: readonly PlannerItemRow[],
  occurrences: readonly PlannerOccurrenceRow[],
  parentId: string,
): readonly StepView[] {
  const done = new Set(
    occurrences.filter((row) => row.status === 'done').map((row) => row.item_id),
  );
  return items
    .filter(
      (item) =>
        item.parent_id === parentId && item.deleted_at === null && item.status !== 'cancelled',
    )
    .sort(byPosition)
    .map((item) => ({ item, done: item.status === 'done' || done.has(item.id) }));
}

export type StepCreate = Pick<
  PlannerItemCreate,
  'collection_id' | 'kind' | 'title' | 'parent_id' | 'position'
>;

export function stepCreateOf(
  parent: PlannerItemRow,
  steps: readonly StepView[],
  text: string,
): StepCreate | null {
  const title = text.trim();
  if (title === '') return null;
  const last = steps.reduce((most, step) => Math.max(most, step.item.position), 0);
  return {
    collection_id: parent.collection_id,
    kind: 'task',
    title,
    parent_id: parent.id,
    position: last + 1,
  };
}

export interface ItemStepsProps {
  readonly steps: readonly StepView[];
  readonly disabled: boolean;
  readonly onDone: (step: StepView) => void;
  readonly onAdd: (title: string) => void;
}

function AddStep({ disabled, onAdd }: Pick<ItemStepsProps, 'disabled' | 'onAdd'>): ReactNode {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  if (!adding) {
    return (
      <View className="self-start">
        <Button
          label="Add a step"
          icon="plus"
          variant="text"
          disabled={disabled}
          onPress={() => {
            setAdding(true);
          }}
        />
      </View>
    );
  }
  const submit = (): void => {
    if (text.trim() !== '') onAdd(text);
    setText('');
  };
  return (
    <TextField
      label="New step"
      value={text}
      onChange={setText}
      onSubmit={submit}
      onBlur={() => {
        submit();
        setAdding(false);
      }}
      placeholder="Shoes by the door"
      focusOnMount
      showLabel={false}
    />
  );
}

export function ItemSteps({ steps, disabled, onDone, onAdd }: ItemStepsProps): ReactNode {
  const done = steps.filter((step) => step.done).length;
  return (
    <Section
      title="Steps"
      {...(steps.length === 0 ? {} : { caption: `${String(done)} of ${String(steps.length)}` })}
    >
      <View className="px-4">
        {steps.map((step) => (
          <Checkbox
            key={step.item.id}
            label={step.item.title}
            checked={step.done}
            disabled={disabled || step.done}
            onChange={() => {
              onDone(step);
            }}
          />
        ))}
        <AddStep disabled={disabled} onAdd={onAdd} />
      </View>
    </Section>
  );
}

export function ItemNotes({
  notes,
  disabled,
  onChange,
}: {
  readonly notes: string;
  readonly disabled: boolean;
  readonly onChange: (changes: ItemChanges) => void;
}): ReactNode {
  const [text, setText] = useState(notes);
  const commit = (): void => {
    if (text !== notes) onChange({ notes: text });
  };
  return (
    <TextField
      label="Notes"
      value={text}
      onChange={setText}
      onBlur={commit}
      placeholder="Add notes"
      multiline
      disabled={disabled}
    />
  );
}
