import type {
  AutomationBinding,
  AutomationCommandInput,
  AutomationInput,
} from './automation-bindings';
import type { Comparison } from './comparison';
import {
  isFromLiteral,
  type FromV2,
  type InputV2,
  type OperandV2,
  type ToV2,
  type TestV2,
  type TriggerTestV2,
} from './automation-v2-schema';
import type { JsonValue } from './values';

export class UnmigratedError extends Error {
  override readonly name = 'UnmigratedError';
}

export function idOf(node: { readonly nodeId?: string | undefined }): { readonly id?: string } {
  return node.nodeId === undefined ? {} : { id: node.nodeId };
}

export function literalOf(value: JsonValue): InputV2 {
  return isFromLiteral(value) ? { from: { literal: value } } : value;
}

export function toOfLiteral(value: JsonValue): ToV2 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  if (isFromLiteral(value)) return { from: { literal: value } };
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, literalOf(entry)]));
}

function operandOf(binding: AutomationBinding): OperandV2 {
  switch (binding.source) {
    case 'literal':
      return { literal: binding.value };
    case 'value':
      return { value: binding.valueId };
    case 'parameter':
      return { input: binding.name };
    case 'capability':
      return { device: binding.deviceId, control: binding.capability };
  }
}

function fromOf(input: AutomationInput): FromV2 {
  const { binding, offset } = input;
  if (offset === undefined) return { from: operandOf(binding) };
  const min = binding.kind === 'duration' ? Math.max(offset.minimum ?? 0, 0) : offset.minimum;
  return {
    from: operandOf(binding),
    add: offset.operation === 'add' ? offset.amount : 0 - offset.amount,
    ...(min === undefined ? {} : { min }),
    ...(offset.maximum === undefined ? {} : { max: offset.maximum }),
  };
}

export function inputV2Of(input: AutomationInput): InputV2 {
  const { binding, offset } = input;
  return binding.source === 'literal' && offset === undefined
    ? literalOf(binding.value)
    : fromOf(input);
}

export function compareSubjectOf(input: AutomationInput): OperandV2 | FromV2 {
  return input.offset === undefined ? operandOf(input.binding) : fromOf(input);
}

export function toOfCommand(input: AutomationCommandInput): ToV2 {
  if (input.type === 'value') return inputV2Of(input.input);
  if ('from' in input.fields)
    throw new UnmigratedError('An action argument is named from, which a v2 input cannot carry');
  return Object.fromEntries(
    Object.entries(input.fields).map(([key, field]) => [key, inputV2Of(field)]),
  );
}

export function testOf(comparison: Exclude<Comparison, { operator: 'changed' }>): TestV2 {
  switch (comparison.operator) {
    case 'eq':
    case 'ne':
      return { is: comparison.operator, to: comparison.value };
    case 'between':
      return { is: 'between', min: comparison.min, max: comparison.max };
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return { is: comparison.operator, to: comparison.value };
  }
}

export function triggerTestOf(comparison: Comparison): TriggerTestV2 {
  return comparison.operator === 'changed' ? { is: 'changed' } : testOf(comparison);
}
