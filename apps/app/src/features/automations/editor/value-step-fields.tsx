import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AutomationValueRow, StepV2 } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { kindOfValue, type LiteralShape } from '../model/inputs';
import { valueStepFor } from '../model/blanks';
import { InputField } from './input-field';
import { ValueLibraryButtons } from './library-buttons';

type ValueStep = Extract<StepV2, { do: 'value' }>;
type Operation = ValueStep['op'];

const OPERATIONS: Readonly<Record<AutomationValueRow['content']['kind'], readonly Operation[]>> = {
  boolean: ['toggle', 'set'],
  number: ['set', 'add', 'subtract'],
  duration: ['set', 'add', 'subtract'],
  choice: ['next', 'previous', 'set'],
};

const LABELS: Readonly<Record<Operation, string>> = {
  set: 'Set',
  toggle: 'Toggle',
  add: 'Add',
  subtract: 'Subtract',
  next: 'Move to the next choice',
  previous: 'Move to the previous choice',
};

function shapeOf(row: AutomationValueRow): LiteralShape {
  return row.content.kind === 'choice'
    ? { type: 'kind', kind: 'choice', choices: row.content.choices }
    : { type: 'kind', kind: kindOfValue(row.content) };
}

function amountFor(row: AutomationValueRow, op: Operation): ValueStep['amount'] {
  if (op === 'set') return row.content.kind === 'boolean' ? true : row.content.value;
  if (op === 'add' || op === 'subtract') return row.content.kind === 'duration' ? 1000 : 1;
  return undefined;
}

function withOperation(step: ValueStep, row: AutomationValueRow, op: Operation): ValueStep {
  const { amount: _amount, ...rest } = step;
  const amount = amountFor(row, op);
  return { ...rest, op, ...(amount === undefined ? {} : { amount }) };
}

interface ValueStepProps {
  readonly catalog: Catalog;
  readonly step: ValueStep;
  readonly onChange: (step: ValueStep) => void;
}

function ValuePicker({ catalog, step, onChange }: ValueStepProps): ReactNode {
  const row = catalog.values.find((value) => value.id === step.value);
  return (
    <>
      <Select
        label="Value"
        searchable
        value={step.value}
        options={catalog.values.map((entry) => ({ value: entry.id, label: entry.content.name }))}
        onChange={(id) => {
          const selected = catalog.values.find((entry) => entry.id === id);
          if (selected !== undefined && selected.id !== step.value)
            onChange({ ...valueStepFor(selected), id: step.id });
        }}
      />
      <ValueLibraryButtons
        row={row ?? null}
        kind={row?.content.kind ?? 'boolean'}
        onSelect={(selected) => {
          onChange({ ...valueStepFor(selected), id: step.id });
        }}
      />
    </>
  );
}

function Operation({
  catalog,
  step,
  row,
  onChange,
}: ValueStepProps & { readonly row: AutomationValueRow }): ReactNode {
  return (
    <>
      <Select
        label="Change"
        value={step.op}
        options={OPERATIONS[row.content.kind].map((op) => ({ value: op, label: LABELS[op] }))}
        onChange={(op) => {
          onChange(withOperation(step, row, op));
        }}
      />
      {step.amount === undefined ? null : (
        <InputField
          catalog={catalog}
          label="Amount"
          shape={shapeOf(row)}
          input={step.amount}
          onChange={(amount) => {
            onChange({ ...step, amount });
          }}
        />
      )}
    </>
  );
}

export function ValueStepFields(props: ValueStepProps): ReactNode {
  const row = props.catalog.values.find((value) => value.id === props.step.value);
  return (
    <View className="gap-3">
      <ValuePicker {...props} />
      {row === undefined ? (
        <Text variant="callout" tone="critical">
          This Value was deleted.
        </Text>
      ) : (
        <Operation {...props} row={row} />
      )}
    </View>
  );
}
