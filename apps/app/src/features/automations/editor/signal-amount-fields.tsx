import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { Comparison } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { TextField } from '../../../components/text-field';
import { OPERATOR_LABELS } from '../model/capability-choices';

const OPERATORS = ['changed', 'gt', 'gte', 'lt', 'lte', 'between'] as const;

type AmountOperator = (typeof OPERATORS)[number];

const OPERATOR_OPTIONS = OPERATORS.map((operator) => ({
  value: operator,
  label: operator === 'changed' ? 'Any change' : OPERATOR_LABELS[operator],
}));

function anchorOf(comparison: Comparison): number {
  if (comparison.operator === 'between') {
    return comparison.min;
  }
  return 'value' in comparison && typeof comparison.value === 'number' ? comparison.value : 0;
}

function withOperator(comparison: Comparison, operator: AmountOperator): Comparison {
  const value = anchorOf(comparison);
  switch (operator) {
    case 'changed':
      return { operator };
    case 'between':
      return { operator, min: value, max: value };
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return { operator, value };
  }
}

function NumberInput({
  label,
  value,
  unit,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly unit: string | null;
  readonly onChange: (value: number) => void;
}): ReactNode {
  const [text, setText] = useState(String(value));
  const parsed = Number(text.replace(',', '.'));
  const valid = text.trim() !== '' && Number.isFinite(parsed);
  return (
    <TextField
      label={unit === null ? label : `${label} (${unit})`}
      kind="number"
      value={text}
      error={valid ? null : 'Write a number.'}
      onChange={(next) => {
        setText(next);
        const number = Number(next.replace(',', '.'));
        if (next.trim() !== '' && Number.isFinite(number)) {
          onChange(number);
        }
      }}
    />
  );
}

function AmountValues({
  comparison,
  unit,
  onChange,
}: {
  readonly comparison: Comparison;
  readonly unit: string | null;
  readonly onChange: (comparison: Comparison) => void;
}): ReactNode {
  if (comparison.operator === 'between') {
    return (
      <View className="gap-3">
        <NumberInput
          label="From"
          value={comparison.min}
          unit={unit}
          onChange={(min) => {
            onChange({ ...comparison, min, max: Math.max(min, comparison.max) });
          }}
        />
        <NumberInput
          label="To"
          value={comparison.max}
          unit={unit}
          onChange={(max) => {
            onChange({ ...comparison, max, min: Math.min(max, comparison.min) });
          }}
        />
      </View>
    );
  }
  if (comparison.operator === 'changed' || typeof comparison.value !== 'number') {
    return null;
  }
  return (
    <NumberInput
      label="Value"
      value={comparison.value}
      unit={unit}
      onChange={(value) => {
        onChange({ ...comparison, value });
      }}
    />
  );
}

export function SignalAmountFields({
  comparison,
  unit,
  onChange,
}: {
  readonly comparison: Comparison;
  readonly unit: string | null;
  readonly onChange: (comparison: Comparison) => void;
}): ReactNode {
  const operator = OPERATORS.find((candidate) => candidate === comparison.operator) ?? null;
  return (
    <View className="gap-3">
      <Select
        label="When it"
        value={operator}
        options={OPERATOR_OPTIONS}
        onChange={(next) => {
          onChange(withOperator(comparison, next));
        }}
      />
      <AmountValues comparison={comparison} unit={unit} onChange={onChange} />
    </View>
  );
}
