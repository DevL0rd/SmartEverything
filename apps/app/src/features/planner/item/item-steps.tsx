import type {
  PlannerItemCreate,
  PlannerItemRow,
  PlannerOccurrenceRow,
} from '@smarteverything/domain';
import { useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ReorderableList } from '../../../components/reorderable-list';
import { Section } from '../../../components/section';
import { TextField } from '../../../components/text-field';
import { compareText } from '../../../format/text';
import type { ItemChanges } from './repeat-scope-bar';
import { StepRow } from './step-row';
import { stepMoveOf, type StepMove } from './steps-model';

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
  readonly onMove: (move: StepMove) => void;
  readonly onOutdent: ((step: StepView) => void) | null;
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

function keyOf(step: StepView): string {
  return step.item.id;
}

function labelOf(step: StepView): string {
  return step.item.title;
}

function StepList(props: ItemStepsProps): ReactNode {
  const { steps, disabled, onDone, onMove, onOutdent } = props;
  const row = (step: StepView): ReactElement => (
    <StepRow step={step} disabled={disabled} onDone={onDone} onOutdent={onOutdent} />
  );
  if (disabled || steps.length < 2) {
    if (steps.length === 0) return null;
    return (
      <View className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
        {steps.map((step, index) => (
          <View key={step.item.id}>
            {index === 0 ? null : <View className="ml-18 h-hairline bg-outline-variant" />}
            {row(step)}
          </View>
        ))}
      </View>
    );
  }
  return (
    <ReorderableList
      items={steps}
      keyOf={keyOf}
      labelOf={labelOf}
      renderItem={row}
      onReorder={(order) => {
        const move = stepMoveOf(
          steps.map((step) => ({ id: step.item.id, position: step.item.position })),
          order,
        );
        if (move !== null) onMove(move);
      }}
    />
  );
}

export function ItemSteps(props: ItemStepsProps): ReactNode {
  const { steps, disabled, onAdd } = props;
  const done = steps.filter((step) => step.done).length;
  return (
    <Section
      title="Steps"
      {...(steps.length === 0 ? {} : { caption: `${String(done)} of ${String(steps.length)}` })}
    >
      <View className="gap-1">
        <StepList {...props} />
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
    <Section title="Notes">
      <TextField
        label="Notes"
        value={text}
        onChange={setText}
        onBlur={commit}
        placeholder="Add notes"
        multiline
        disabled={disabled}
        showLabel={false}
      />
    </Section>
  );
}
