import { z } from 'zod';
import { CAPABILITY_KEY } from './capabilities';
import { AUTOMATION_VALUE_ID, AUTOMATION_CHOICE_ID } from './automation-values';
import { JSON_VALUE, type JsonValue } from './values';

export const AUTOMATION_BINDING_KIND = z.enum([
  'boolean',
  'number',
  'duration',
  'choice',
  'string',
]);
export type AutomationBindingKind = z.infer<typeof AUTOMATION_BINDING_KIND>;
const NUMERIC_OFFSET = z.strictObject({
  operation: z.enum(['add', 'subtract']),
  amount: z.number().nonnegative(),
  unit: z.enum(['number', 'milliseconds']),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
});
export const AUTOMATION_BINDING = z.discriminatedUnion('source', [
  z.strictObject({
    source: z.literal('literal'),
    kind: AUTOMATION_BINDING_KIND,
    value: JSON_VALUE,
  }),
  z.strictObject({
    source: z.literal('value'),
    kind: AUTOMATION_BINDING_KIND,
    valueId: AUTOMATION_VALUE_ID,
  }),
  z.strictObject({
    source: z.literal('parameter'),
    kind: AUTOMATION_BINDING_KIND,
    name: z.string().trim().min(1).max(80),
  }),
  z.strictObject({
    source: z.literal('capability'),
    kind: AUTOMATION_BINDING_KIND,
    deviceId: z.uuid(),
    capability: CAPABILITY_KEY,
  }),
]);
export const AUTOMATION_INPUT = z.strictObject({
  binding: AUTOMATION_BINDING,
  offset: NUMERIC_OFFSET.optional(),
});
export type AutomationBinding = z.infer<typeof AUTOMATION_BINDING>;
export type AutomationInput = z.infer<typeof AUTOMATION_INPUT>;
export const AUTOMATION_COMMAND_INPUT = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('value'), input: AUTOMATION_INPUT }),
  z.strictObject({
    type: z.literal('fields'),
    fields: z.record(z.string().min(1).max(80), AUTOMATION_INPUT),
  }),
]);
export type AutomationCommandInput = z.infer<typeof AUTOMATION_COMMAND_INPUT>;
export const SEQUENCE_PARAMETER = z.strictObject({
  name: z.string().trim().min(1).max(80),
  kind: AUTOMATION_BINDING_KIND,
});
export type SequenceParameter = z.infer<typeof SEQUENCE_PARAMETER>;
export interface AutomationBindingContext {
  readonly value: (id: string, kind: AutomationBindingKind) => JsonValue;
  readonly parameter: (name: string, kind: AutomationBindingKind) => JsonValue;
  readonly capability: (
    deviceId: string,
    key: z.infer<typeof CAPABILITY_KEY>,
    kind: AutomationBindingKind,
  ) => JsonValue;
}
export class AutomationBindingError extends Error {
  override readonly name = 'AutomationBindingError';
  constructor(readonly reason: string) {
    super(`Automation binding failed: ${reason}`);
  }
}
const BINDING_VALUES = {
  choice: AUTOMATION_CHOICE_ID,
  duration: z.number().nonnegative(),
  number: z.number(),
  boolean: z.boolean(),
  string: z.string(),
};
export function checkedBindingValue(kind: AutomationBindingKind, value: JsonValue): JsonValue {
  const parsed = BINDING_VALUES[kind].safeParse(value);
  if (!parsed.success)
    throw new AutomationBindingError(
      `expected ${kind}, received ${value === null ? 'null' : typeof value}`,
    );
  return parsed.data;
}
function sourceValue(binding: AutomationBinding, context: AutomationBindingContext): JsonValue {
  switch (binding.source) {
    case 'literal':
      return binding.value;
    case 'value':
      return context.value(binding.valueId, binding.kind);
    case 'parameter':
      return context.parameter(binding.name, binding.kind);
    case 'capability':
      return context.capability(binding.deviceId, binding.capability, binding.kind);
  }
}
export function resolveAutomationInput(
  input: AutomationInput,
  context: AutomationBindingContext,
): JsonValue {
  const value = checkedBindingValue(input.binding.kind, sourceValue(input.binding, context));
  if (input.offset === undefined) return value;
  const { offset, binding } = input;
  const unit = binding.kind === 'duration' ? 'milliseconds' : 'number';
  if (
    typeof value !== 'number' ||
    !['number', 'duration'].includes(binding.kind) ||
    offset.unit !== unit
  )
    throw new AutomationBindingError('numeric offsets need a matching numeric kind and unit');
  const result = value + (offset.operation === 'add' ? offset.amount : -offset.amount);
  checkedBindingValue(binding.kind, result);
  requireInputBounds(result, offset);
  return result;
}
export function resolveCommandInput(
  input: AutomationCommandInput,
  context: AutomationBindingContext,
): JsonValue {
  return input.type === 'value'
    ? resolveAutomationInput(input.input, context)
    : Object.fromEntries(
        Object.entries(input.fields).map(([key, field]) => [
          key,
          resolveAutomationInput(field, context),
        ]),
      );
}

function requireInputBounds(value: number, bounds: z.infer<typeof NUMERIC_OFFSET>): void {
  if (
    (bounds.minimum !== undefined && value < bounds.minimum) ||
    (bounds.maximum !== undefined && value > bounds.maximum)
  )
    throw new AutomationBindingError('the result exceeds the input bounds');
}
