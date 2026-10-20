import { z } from 'zod';

export const MAX_AUTOMATION_CHOICES = 100;
export const AUTOMATION_VALUE_ID = z.uuid().brand<'AutomationValueId'>();
export const AUTOMATION_CHOICE_ID = z.uuid().brand<'AutomationChoiceId'>();
const NAME = z.string().trim().min(1).max(80);
const FINITE = z.number();
const BOUNDS = z.strictObject({
  minimum: FINITE.optional(),
  maximum: FINITE.optional(),
  quantum: FINITE.positive().optional(),
  overflow: z.enum(['reject', 'clamp', 'wrap']).default('reject'),
});
const CHOICE = z.strictObject({ id: AUTOMATION_CHOICE_ID, label: NAME });

export const AUTOMATION_VALUE_CONTENT = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('boolean'), name: NAME, value: z.boolean() }),
  z.strictObject({ kind: z.literal('number'), name: NAME, value: FINITE, bounds: BOUNDS }),
  z.strictObject({
    kind: z.literal('duration'),
    name: NAME,
    value: FINITE.nonnegative(),
    bounds: BOUNDS,
  }),
  z.strictObject({
    kind: z.literal('choice'),
    name: NAME,
    value: AUTOMATION_CHOICE_ID,
    choices: z.array(CHOICE).min(1).max(MAX_AUTOMATION_CHOICES),
    overflow: z.enum(['clamp', 'wrap']).default('clamp'),
  }),
]);
export type AutomationValueContent = z.infer<typeof AUTOMATION_VALUE_CONTENT>;
export const AUTOMATION_VALUE_ROW = z.strictObject({
  id: AUTOMATION_VALUE_ID,
  content: AUTOMATION_VALUE_CONTENT,
  revision: z.int().positive(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export type AutomationValueRow = z.infer<typeof AUTOMATION_VALUE_ROW>;

const NUMERIC_ADJUSTMENTS = [
  z.strictObject({ type: z.literal('add'), value: FINITE.nonnegative() }),
  z.strictObject({ type: z.literal('subtract'), value: FINITE.nonnegative() }),
] as const;
const NUMERIC_OPERATION = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('set'), value: FINITE }),
  ...NUMERIC_ADJUSTMENTS,
]);
const DURATION_OPERATION = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('set'), value: FINITE.nonnegative() }),
  ...NUMERIC_ADJUSTMENTS,
]);
export const AUTOMATION_VALUE_OPERATION = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('boolean'),
    operation: z.discriminatedUnion('type', [
      z.strictObject({ type: z.literal('set'), value: z.boolean() }),
      z.strictObject({ type: z.literal('toggle') }),
    ]),
  }),
  z.strictObject({ kind: z.literal('number'), operation: NUMERIC_OPERATION }),
  z.strictObject({ kind: z.literal('duration'), operation: DURATION_OPERATION }),
  z.strictObject({
    kind: z.literal('choice'),
    operation: z.discriminatedUnion('type', [
      z.strictObject({ type: z.literal('set'), value: AUTOMATION_CHOICE_ID }),
      z.strictObject({ type: z.literal('next') }),
      z.strictObject({ type: z.literal('previous') }),
    ]),
  }),
]);
export type AutomationValueOperation = z.infer<typeof AUTOMATION_VALUE_OPERATION>;

export class AutomationValueError extends Error {
  override readonly name = 'AutomationValueError';
  constructor(readonly reason: string) {
    super(`Invalid automation Value: ${reason}`);
  }
}

const TICK_TOLERANCE = 1e-9;
function ticks(value: number): number {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || Math.abs(value - rounded) > TICK_TOLERANCE) {
    throw new AutomationValueError('the value and range must align to a safe integral quantum');
  }
  return rounded;
}

type NumericValue = Extract<AutomationValueContent, { kind: 'number' | 'duration' }>;
function numericBounds(content: NumericValue): {
  readonly low: number | undefined;
  readonly high: number | undefined;
} {
  const { minimum, maximum } = content.bounds;
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    throw new AutomationValueError('minimum must not exceed maximum');
  }
  if (
    content.kind === 'duration' &&
    [minimum, maximum].some((bound) => bound !== undefined && bound < 0)
  ) {
    throw new AutomationValueError('duration bounds must be nonnegative milliseconds');
  }
  return { low: content.kind === 'duration' ? (minimum ?? 0) : minimum, high: maximum };
}

function numericValue(content: NumericValue, value: number): number {
  const { quantum, overflow, minimum } = content.bounds;
  const { low, high } = numericBounds(content);
  if (!Number.isFinite(value)) throw new AutomationValueError('numbers must be finite');
  if (overflow === 'wrap') return wrapValue(content, value);
  const bounded =
    overflow === 'clamp'
      ? Math.min(high ?? Infinity, Math.max(low ?? -Infinity, value))
      : rejectOutsideBounds(value, low, high);
  if (quantum !== undefined) ticks((bounded - (minimum ?? 0)) / quantum);
  return bounded;
}

function rejectOutsideBounds(
  value: number,
  low: number | undefined,
  high: number | undefined,
): number {
  if ((low !== undefined && value < low) || (high !== undefined && value > high)) {
    throw new AutomationValueError('the result is outside the configured bounds');
  }
  return value;
}

function wrapValue(content: NumericValue, value: number): number {
  const { minimum, maximum, quantum } = content.bounds;
  if (
    minimum === undefined ||
    maximum === undefined ||
    quantum === undefined ||
    maximum <= minimum
  ) {
    throw new AutomationValueError('wrap requires increasing bounds and a positive quantum');
  }
  const length = ticks((maximum - minimum) / quantum) + 1;
  if (!Number.isSafeInteger(length))
    throw new AutomationValueError('wrap range exceeds safe integral ticks');
  const offset = ticks((value - minimum) / quantum);
  const next = ((offset % length) + length) % length;
  if (next === 0) return minimum;
  return next === length - 1 ? maximum : minimum + next * quantum;
}

export function validateAutomationValue(input: AutomationValueContent): AutomationValueContent {
  const content = AUTOMATION_VALUE_CONTENT.parse(input);
  if (content.kind === 'boolean') return content;
  if (content.kind === 'choice') {
    if (new Set(content.choices.map((entry) => entry.id)).size !== content.choices.length) {
      throw new AutomationValueError('choice identities must be unique');
    }
    if (!content.choices.some((entry) => entry.id === content.value)) {
      throw new AutomationValueError('the selected choice does not exist');
    }
    return content;
  }
  const checked = numericValue(content, content.value);
  if (checked !== content.value)
    throw new AutomationValueError('the initial value must be within bounds');
  return content;
}

function advanceChoice(
  content: Extract<AutomationValueContent, { kind: 'choice' }>,
  delta: number,
): AutomationValueContent {
  const index = content.choices.findIndex((entry) => entry.id === content.value);
  const count = content.choices.length;
  const next =
    content.overflow === 'wrap'
      ? (index + delta + count) % count
      : Math.max(0, Math.min(count - 1, index + delta));
  return AUTOMATION_VALUE_CONTENT.parse({ ...content, value: content.choices[next]?.id });
}

function numericOperation(
  content: NumericValue,
  change: AutomationValueOperation,
): AutomationValueContent {
  if (change.kind === 'boolean' || change.kind === 'choice') {
    throw new AutomationValueError(`operation kind ${change.kind} does not match ${content.kind}`);
  }
  if (change.kind !== content.kind) {
    throw new AutomationValueError(`operation kind ${change.kind} does not match ${content.kind}`);
  }
  const operation = change.operation;
  const value =
    operation.type === 'set'
      ? operation.value
      : content.value + (operation.type === 'add' ? operation.value : -operation.value);
  return { ...content, value: numericValue(content, value) };
}

export function applyAutomationValueOperation(
  input: AutomationValueContent,
  raw: AutomationValueOperation,
): AutomationValueContent {
  const content = validateAutomationValue(input);
  const change = AUTOMATION_VALUE_OPERATION.parse(raw);
  if (content.kind === 'number' || content.kind === 'duration')
    return numericOperation(content, change);
  if (content.kind === 'boolean' && change.kind === 'boolean') {
    return {
      ...content,
      value: change.operation.type === 'toggle' ? !content.value : change.operation.value,
    };
  }
  if (content.kind === 'choice' && change.kind === 'choice') {
    return change.operation.type === 'set'
      ? validateAutomationValue({ ...content, value: change.operation.value })
      : advanceChoice(content, change.operation.type === 'next' ? 1 : -1);
  }
  throw new AutomationValueError(`operation kind ${change.kind} does not match ${content.kind}`);
}
