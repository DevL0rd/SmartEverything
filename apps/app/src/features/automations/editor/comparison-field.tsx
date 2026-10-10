import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Comparison, JsonValue } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { OPERATOR_LABELS, comparisonFor, type Operator } from '../model/capability-choices';
import type { Target } from './target-fields';
import { ValueInput } from './value-input';

function numberOf(value: JsonValue, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function BetweenValues({
  target,
  comparison,
  onChange,
}: {
  readonly target: Target;
  readonly comparison: Extract<Comparison, { operator: 'between' }>;
  readonly onChange: (comparison: Comparison) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <ValueInput
        device={target.device}
        capability={target.capability}
        label="From"
        value={comparison.min}
        onChange={(min) => {
          onChange({ ...comparison, min: numberOf(min, comparison.min) });
        }}
      />
      <ValueInput
        device={target.device}
        capability={target.capability}
        label="To"
        value={comparison.max}
        onChange={(max) => {
          onChange({ ...comparison, max: numberOf(max, comparison.max) });
        }}
      />
    </View>
  );
}

function ComparisonValue({
  target,
  comparison,
  onChange,
}: {
  readonly target: Target;
  readonly comparison: Comparison;
  readonly onChange: (comparison: Comparison) => void;
}): ReactNode {
  switch (comparison.operator) {
    case 'changed':
      return (
        <Text variant="callout" tone="variant">
          Runs whenever the value changes.
        </Text>
      );
    case 'between':
      return <BetweenValues target={target} comparison={comparison} onChange={onChange} />;
    case 'eq':
    case 'ne':
      return (
        <ValueInput
          device={target.device}
          capability={target.capability}
          label="Value"
          value={comparison.value}
          onChange={(value) => {
            onChange({ ...comparison, value });
          }}
        />
      );
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return (
        <ValueInput
          device={target.device}
          capability={target.capability}
          label="Value"
          value={comparison.value}
          onChange={(value) => {
            onChange({ ...comparison, value: numberOf(value, comparison.value) });
          }}
        />
      );
  }
}

export function ComparisonField({
  target,
  comparison,
  operators,
  onChange,
}: {
  readonly target: Target;
  readonly comparison: Comparison;
  readonly operators: readonly Operator[];
  readonly onChange: (comparison: Comparison) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <Select
        label="Compare"
        value={comparison.operator}
        options={operators.map((operator) => ({
          value: operator,
          label: OPERATOR_LABELS[operator],
        }))}
        onChange={(operator) => {
          onChange(comparisonFor(operator, target.capability.value, comparison));
        }}
      />
      <ComparisonValue target={target} comparison={comparison} onChange={onChange} />
    </View>
  );
}
