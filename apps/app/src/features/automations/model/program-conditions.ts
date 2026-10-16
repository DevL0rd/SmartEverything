import type { AutomationInput, Condition } from '@smarteverything/domain';
import type { Catalog } from '../data/use-automations';
import { CONDITION_TYPES, blankCondition } from './blanks';
import { CONDITION_KINDS } from '../editor/kinds';
import { choicesOf } from '../editor/add-items';
import { literalInput, literalValue } from './input-bindings';

export function conditionLabel(condition: Condition): string {
  if (condition.type === 'value') return 'Value';
  return condition.type === 'binding' ? 'Typed input' : CONDITION_KINDS[condition.type].label;
}
export function newProgramCondition(type: string, catalog: Catalog): Condition | null {
  const legacy = CONDITION_TYPES.find((value) => value === type);
  if (legacy !== undefined) return blankCondition(legacy, choicesOf(catalog));
  if (type === 'binding')
    return { type, input: literalInput('number'), comparison: { operator: 'eq', value: 0 } };
  const row = catalog.values?.[0];
  return row === undefined
    ? null
    : { type: 'value', valueId: row.id, comparison: { operator: 'eq', value: row.content.value } };
}
export function programConditionChoices(
  catalog: Catalog,
): readonly { readonly value: string; readonly label: string }[] {
  return [
    ...CONDITION_TYPES.filter((type) => blankCondition(type, choicesOf(catalog)) !== null).map(
      (value) => ({ value, label: CONDITION_KINDS[value].label }),
    ),
    ...((catalog.values ?? []).length === 0 ? [] : [{ value: 'value', label: 'Remembered Value' }]),
    { value: 'binding', label: 'Typed input' },
  ];
}

export function conditionWithInput(
  condition: Extract<Condition, { type: 'binding' }>,
  input: AutomationInput,
): Extract<Condition, { type: 'binding' }> {
  if (
    condition.input.binding.kind === input.binding.kind ||
    compatibleNumericComparison(condition, input)
  )
    return { ...condition, input };
  return {
    ...condition,
    input,
    comparison: { operator: 'eq', value: literalValue(input.binding.kind) },
  };
}

function compatibleNumericComparison(
  condition: Extract<Condition, { type: 'binding' }>,
  input: AutomationInput,
): boolean {
  const numeric = new Set(['number', 'duration']);
  if (!numeric.has(condition.input.binding.kind) || !numeric.has(input.binding.kind)) return false;
  const comparison = condition.comparison;
  const values =
    comparison.operator === 'between' ? [comparison.min, comparison.max] : [comparison.value];
  return values.every(
    (value) => typeof value === 'number' && (input.binding.kind === 'number' || value >= 0),
  );
}
