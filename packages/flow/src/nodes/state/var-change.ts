import {
  AutomationValueError,
  applyAutomationValueOperation,
  jsonEquals,
} from '@smarteverything/domain';
import type {
  AutomationValueContent,
  AutomationValueOperation,
  JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';

export const VAR_CHANGE_OPS = [
  'toggle',
  'add',
  'subtract',
  'multiply',
  'next',
  'previous',
  'append',
  'remove',
  'set_field',
] as const;

export const VAR_CHANGE_REQUEST = z.strictObject({
  op: z.enum(VAR_CHANGE_OPS),
  edge: z.enum(['wrap', 'clamp']).default('wrap'),
  amount: z.json().optional(),
  field: z.string().optional(),
  steps: z.array(z.json()).optional(),
});
export type VarChangeRequest = z.input<typeof VAR_CHANGE_REQUEST>;
type ParsedChange = z.output<typeof VAR_CHANGE_REQUEST>;

export interface VarChangeFailure {
  readonly ok: false;
  readonly errorClass: 'Invalid' | 'TypeError' | 'NotFound' | 'MathError';
  readonly message: string;
}
export interface VarChangeSuccess {
  readonly ok: true;
  readonly value: JsonValue;
  readonly previous: JsonValue;
  readonly wrapped: boolean;
}
export type VarChangeResult = VarChangeSuccess | VarChangeFailure;
export type HomeChangeResult =
  (VarChangeSuccess & { readonly content: AutomationValueContent }) | VarChangeFailure;

type Step = { readonly value: JsonValue; readonly wrapped?: boolean } | VarChangeFailure;

function fail(errorClass: VarChangeFailure['errorClass'], message: string): VarChangeFailure {
  return { ok: false, errorClass, message };
}

function isFailure(step: Step): step is VarChangeFailure {
  return 'ok' in step;
}

function isList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isRecord(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !isList(value);
}

function arithmetic(current: JsonValue, change: ParsedChange): Step {
  if (typeof current !== 'number') return fail('TypeError', `${change.op} needs a number`);
  if (typeof change.amount !== 'number')
    return fail('Invalid', `${change.op} needs a number amount`);
  const result =
    change.op === 'add'
      ? current + change.amount
      : change.op === 'subtract'
        ? current - change.amount
        : current * change.amount;
  return Number.isFinite(result)
    ? { value: result }
    : fail('MathError', 'the result is not a finite number');
}

function stepIndex(
  index: number,
  delta: number,
  count: number,
  edge: 'wrap' | 'clamp',
): { readonly index: number; readonly wrapped: boolean } {
  const target = index + delta;
  if (edge === 'wrap')
    return { index: (target + count) % count, wrapped: target < 0 || target >= count };
  return { index: Math.max(0, Math.min(count - 1, target)), wrapped: false };
}

function stepThrough(current: JsonValue, change: ParsedChange): Step {
  const steps = change.steps ?? [];
  if (steps.length === 0) return fail('Invalid', `${change.op} needs the steps to go through`);
  const index = steps.findIndex((item) => jsonEquals(item, current));
  if (index < 0) return fail('NotFound', 'the current value is not one of the steps');
  const moved = stepIndex(index, change.op === 'next' ? 1 : -1, steps.length, change.edge);
  const value = steps.reduce(
    (picked, item, position) => (position === moved.index ? item : picked),
    current,
  );
  return { value, wrapped: moved.wrapped };
}

function listEdit(current: JsonValue, change: ParsedChange): Step {
  if (!isList(current)) return fail('TypeError', `${change.op} needs a list`);
  const { amount } = change;
  if (amount === undefined) return fail('Invalid', `${change.op} needs an item`);
  if (change.op === 'append') return { value: [...current, amount] };
  const index = current.findIndex((item) => jsonEquals(item, amount));
  if (index < 0) return fail('NotFound', 'the item is not in the list');
  return { value: current.filter((_, position) => position !== index) };
}

function fieldEdit(current: JsonValue, change: ParsedChange): Step {
  if (!isRecord(current)) return fail('TypeError', 'set_field needs a record');
  if (change.field === undefined || change.field === '')
    return fail('Invalid', 'set_field needs a field name');
  if (change.amount === undefined) return fail('Invalid', 'set_field needs a value');
  return { value: { ...current, [change.field]: change.amount } };
}

const HANDLERS: Readonly<
  Record<ParsedChange['op'], (current: JsonValue, change: ParsedChange) => Step>
> = {
  toggle: (current) =>
    typeof current === 'boolean'
      ? { value: !current }
      : fail('TypeError', 'toggle needs a true or false value'),
  add: arithmetic,
  subtract: arithmetic,
  multiply: arithmetic,
  next: stepThrough,
  previous: stepThrough,
  append: listEdit,
  remove: listEdit,
  set_field: fieldEdit,
};

export function changeVariable(
  current: JsonValue | undefined,
  request: VarChangeRequest,
): VarChangeResult {
  if (current === undefined) return fail('NotFound', 'the variable has no value yet');
  const change = VAR_CHANGE_REQUEST.parse(request);
  const step = HANDLERS[change.op](current, change);
  if (isFailure(step)) return step;
  return { ok: true, value: step.value, previous: current, wrapped: step.wrapped ?? false };
}

function numericOperation(
  content: Extract<AutomationValueContent, { kind: 'number' | 'duration' }>,
  change: ParsedChange,
): AutomationValueOperation | VarChangeFailure {
  const { amount } = change;
  if (typeof amount !== 'number') return fail('Invalid', `${change.op} needs a number amount`);
  if (change.op === 'multiply') {
    return { kind: content.kind, operation: { type: 'set', value: content.value * amount } };
  }
  const delta = change.op === 'add' ? amount : -amount;
  return {
    kind: content.kind,
    operation: { type: delta >= 0 ? 'add' : 'subtract', value: Math.abs(delta) },
  };
}

function isArithmetic(op: ParsedChange['op']): boolean {
  return op === 'add' || op === 'subtract' || op === 'multiply';
}

function homeOperation(
  content: AutomationValueContent,
  change: ParsedChange,
): AutomationValueOperation | VarChangeFailure {
  const { op } = change;
  if (content.kind === 'boolean' && op === 'toggle') {
    return { kind: 'boolean', operation: { type: 'toggle' } };
  }
  if (content.kind === 'choice' && (op === 'next' || op === 'previous')) {
    return { kind: 'choice', operation: { type: op } };
  }
  if ((content.kind === 'number' || content.kind === 'duration') && isArithmetic(op)) {
    return numericOperation(content, change);
  }
  return fail('TypeError', `${op} does not apply to a ${content.kind} Value`);
}

function choiceWrapped(before: AutomationValueContent, op: string): boolean {
  if (before.kind !== 'choice' || before.overflow !== 'wrap') return false;
  const index = before.choices.findIndex((entry) => entry.id === before.value);
  return op === 'next' ? index === before.choices.length - 1 : index === 0;
}

export function changeHomeValue(
  content: AutomationValueContent,
  request: VarChangeRequest,
): HomeChangeResult {
  const change = VAR_CHANGE_REQUEST.parse(request);
  const operation = homeOperation(content, change);
  if ('ok' in operation) return operation;
  try {
    const next = applyAutomationValueOperation(content, operation);
    return {
      ok: true,
      content: next,
      value: next.value,
      previous: content.value,
      wrapped: choiceWrapped(content, change.op),
    };
  } catch (error) {
    if (error instanceof AutomationValueError) return fail('Invalid', error.message);
    throw error;
  }
}
