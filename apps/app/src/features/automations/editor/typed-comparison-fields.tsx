import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AutomationBindingKind, Condition, JsonValue } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import type { Catalog } from '../data/use-automations';
import { literalValue } from '../model/input-bindings';
import { NumberInput } from './number-input';
import { TypedLiteral } from './binding-fields';

type ValueComparison = Extract<Condition, { type: 'value' }>['comparison'];
interface TypedComparisonFieldsProps {
  readonly kind: AutomationBindingKind;
  readonly comparison: ValueComparison;
  readonly catalog: Catalog;
  readonly onChange: (comparison: ValueComparison) => void;
}
const LABELS = {
  eq: 'Equals',
  ne: 'Does not equal',
  gt: 'Above',
  gte: 'At least',
  lt: 'Below',
  lte: 'At most',
  between: 'Between',
};
function comparisonWith(
  operator: ValueComparison['operator'],
  kind: AutomationBindingKind,
): ValueComparison {
  if (operator === 'between') return { operator, min: 0, max: 1 };
  return operator === 'eq' || operator === 'ne'
    ? { operator, value: literalValue(kind) }
    : { operator, value: 0 };
}
function ComparedValue({
  kind,
  comparison,
  catalog,
  onChange,
}: TypedComparisonFieldsProps): ReactNode {
  const setValue = (value: JsonValue): void => {
    if (comparison.operator === 'eq' || comparison.operator === 'ne')
      onChange({ ...comparison, value });
    else if (comparison.operator !== 'between' && typeof value === 'number')
      onChange({ ...comparison, value });
  };
  if (comparison.operator !== 'between')
    return (
      <TypedLiteral kind={kind} value={comparison.value} catalog={catalog} onChange={setValue} />
    );
  return (
    <>
      <NumberInput
        label="From"
        value={comparison.min}
        onChange={(min) => {
          if (min !== undefined) onChange({ ...comparison, min });
        }}
      />
      <NumberInput
        label="To"
        value={comparison.max}
        onChange={(max) => {
          if (max !== undefined) onChange({ ...comparison, max });
        }}
      />
    </>
  );
}
export function TypedComparisonFields(props: TypedComparisonFieldsProps): ReactNode {
  const { kind, comparison, onChange } = props;
  const operators: readonly ValueComparison['operator'][] =
    kind === 'number' || kind === 'duration'
      ? ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between']
      : ['eq', 'ne'];
  return (
    <View className="gap-3">
      <Select
        label="Compare"
        value={comparison.operator}
        options={operators.map((value) => ({ value, label: LABELS[value] }))}
        onChange={(operator) => {
          onChange(comparisonWith(operator, kind));
        }}
      />
      <ComparedValue {...props} />
    </View>
  );
}
