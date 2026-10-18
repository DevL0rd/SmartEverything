import { z } from 'zod';
import { CAPABILITY_KEY } from './capabilities';
import { CLOCK_TIME, WEEKDAYS } from './automation-conditions';
import { COMPUTER_AUDIO_STEP, COMPUTER_DISPLAY_STEP } from './automation-v2-computer';
import { DEVICE_FAMILIES, EXTRA_ROLES } from './presentation/types';
import { SIGNAL_LIMITS, SIGNAL_SOURCE_NAME, SIGNAL_WINDOW_MODES } from './signals';
import { JSON_VALUE, type JsonValue } from './values';
import { WEATHER_METRICS } from './weather/rules';

export const SET_CONTROL = z.union([CAPABILITY_KEY, z.enum(EXTRA_ROLES)]);
export type SetControl = z.output<typeof SET_CONTROL>;

const ID = z.uuid();
const NODE = { id: ID.optional() };
const DURATION_MS = z.int().min(1);
const TEXT = z.string().trim().min(1);
const SECONDS = (longest: number): z.ZodOptional<z.ZodInt> =>
  z.int().min(1).max(longest).optional();

const WEATHER_OPERANDS = [...WEATHER_METRICS, 'kind'] as const;

export function isFromLiteral(value: JsonValue): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'from' in value;
}

const OPERAND = z.union([
  z.strictObject({ device: ID, control: CAPABILITY_KEY }),
  z.strictObject({ value: ID }),
  z.strictObject({ input: TEXT }),
  z.strictObject({ weather: z.enum(WEATHER_OPERANDS) }),
  z.strictObject({ literal: JSON_VALUE }),
]);
export type OperandV2 = z.infer<typeof OPERAND>;

const FROM = z.strictObject({
  from: OPERAND,
  add: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
export type FromV2 = z.infer<typeof FROM>;

const LITERAL = JSON_VALUE.refine((value) => !isFromLiteral(value), {
  message: 'A literal object must not have a from key',
});
const INPUT = z.union([FROM, LITERAL]);
export type InputV2 = z.infer<typeof INPUT>;

const FIELDS = z.record(
  z.string().refine((key) => key !== 'from'),
  INPUT,
);
const PLAIN_LITERAL = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(JSON_VALUE).readonly(),
]);
const TO = z.union([FROM, FIELDS, PLAIN_LITERAL]);
export type ToV2 = z.infer<typeof TO>;

const COMPARE_SUBJECT = z.union([OPERAND, FROM]);

const TEST_CASES = [
  z.strictObject({ is: z.enum(['eq', 'ne']), to: JSON_VALUE }),
  z.strictObject({ is: z.enum(['gt', 'gte', 'lt', 'lte']), to: z.number() }),
  z
    .strictObject({ is: z.literal('between'), min: z.number(), max: z.number() })
    .refine((range) => range.min <= range.max, { message: 'min must not exceed max' }),
  z.strictObject({ is: z.literal('in'), to: z.array(JSON_VALUE).min(1) }),
] as const;
const TEST = z.discriminatedUnion('is', [...TEST_CASES]);
export type TestV2 = z.infer<typeof TEST>;
const TRIGGER_TEST = z.discriminatedUnion('is', [
  ...TEST_CASES,
  z.strictObject({ is: z.literal('changed') }),
]);
export type TriggerTestV2 = z.infer<typeof TRIGGER_TEST>;

const TIME_WINDOW = z
  .strictObject({
    after: CLOCK_TIME.optional(),
    before: CLOCK_TIME.optional(),
    days: WEEKDAYS.optional(),
  })
  .refine(
    (time) => time.after !== undefined || time.before !== undefined || time.days !== undefined,
    { message: 'A time condition needs a window or days' },
  )
  .refine((time) => time.after === undefined || time.after !== time.before, {
    message: 'A time window must not start and end at the same time',
  });
export type TimeWindowV2 = z.infer<typeof TIME_WINDOW>;

const OFFSET_MINUTES = z.int().min(-720).max(720);
export type ConditionV2 =
  | { readonly all: readonly ConditionV2[] }
  | { readonly any: readonly ConditionV2[] }
  | { readonly not: ConditionV2 }
  | { readonly compare: OperandV2 | FromV2; readonly test: TestV2 }
  | { readonly time: TimeWindowV2 }
  | {
      readonly daylight: 'day' | 'night';
      readonly sunriseOffset?: number | undefined;
      readonly sunsetOffset?: number | undefined;
    };
export const CONDITION_V2: z.ZodType<ConditionV2> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(CONDITION_V2) }),
    z.strictObject({ any: z.array(CONDITION_V2).min(1) }),
    z.strictObject({ not: CONDITION_V2 }),
    z.strictObject({ compare: COMPARE_SUBJECT, test: TEST }),
    z.strictObject({ time: TIME_WINDOW }),
    z.strictObject({
      daylight: z.enum(['day', 'night']),
      sunriseOffset: OFFSET_MINUTES.optional(),
      sunsetOffset: OFFSET_MINUTES.optional(),
    }),
  ]),
);

const SPEECH_SOURCE = z.union([
  z.strictObject({ camera: ID }),
  z.strictObject({ phone: ID }),
  z.strictObject({ computer: ID }),
  z.strictObject({ plugin: TEXT, sourceId: TEXT }),
  z.strictObject({ chat: ID }),
]);
export type SpeechSourceV2 = z.infer<typeof SPEECH_SOURCE>;

export const TRIGGER_V2 = z.discriminatedUnion('on', [
  z.strictObject({ on: z.literal('time'), ...NODE, at: CLOCK_TIME, days: WEEKDAYS.optional() }),
  z.strictObject({ on: z.literal('every'), ...NODE, minutes: z.int().min(1) }),
  z.strictObject({
    on: z.literal('sun'),
    ...NODE,
    event: z.enum(['sunrise', 'sunset']),
    offsetMinutes: OFFSET_MINUTES.optional(),
  }),
  z.strictObject({
    on: z.literal('signal'),
    ...NODE,
    source: SIGNAL_SOURCE_NAME,
    kind: TEXT,
    subject: TEXT.optional(),
    field: TEXT.optional(),
    match: z.record(TEXT, JSON_VALUE).optional(),
    test: TRIGGER_TEST.optional(),
    window: z
      .strictObject({
        of: z.enum(SIGNAL_WINDOW_MODES),
        seconds: z.int().min(1).max(SIGNAL_LIMITS.windowSeconds),
      })
      .optional(),
    holdSeconds: SECONDS(SIGNAL_LIMITS.holdSeconds),
    debounceSeconds: SECONDS(SIGNAL_LIMITS.debounceSeconds),
    cooldownSeconds: SECONDS(SIGNAL_LIMITS.cooldownSeconds),
  }),
  z.strictObject({
    on: z.literal('speech'),
    ...NODE,
    phrase: TEXT.refine((text) => /[\p{L}\p{N}]/u.test(text), 'Use at least one spoken word'),
    caseSensitive: z.boolean().optional(),
    includeBots: z.boolean().optional(),
    source: SPEECH_SOURCE.optional(),
  }),
]);
export type TriggerV2 = z.infer<typeof TRIGGER_V2>;

const TARGET = z.union([
  z.strictObject({ device: ID }),
  z.strictObject({ devices: z.array(ID).min(1) }),
  z.strictObject({ room: ID, families: z.array(z.enum(DEVICE_FAMILIES)).min(1).optional() }),
  z.strictObject({ group: ID }),
]);
export type TargetV2 = z.infer<typeof TARGET>;

const VALUE_OPERATIONS = ['set', 'toggle', 'add', 'subtract', 'next', 'previous'] as const;
const HAS_AMOUNT: ReadonlySet<string> = new Set(['set', 'add', 'subtract']);

const SET_STEP = z
  .strictObject({
    do: z.literal('set'),
    ...NODE,
    target: TARGET,
    control: SET_CONTROL,
    to: TO.optional(),
    by: z.number().optional(),
    percent: z.boolean().optional(),
    for: DURATION_MS.optional(),
    get while() {
      return CONDITION_V2.optional();
    },
    priority: z.int().min(-1000).max(1000).optional(),
  })
  .refine((step) => (step.to === undefined) !== (step.by === undefined), {
    message: 'A set step needs exactly one of to and by',
  })
  .refine(
    (step) =>
      step.for !== undefined ||
      (step.by === undefined && step.while === undefined && step.priority === undefined),
    { message: 'by, while and priority belong to a temporary change with for' },
  );

const LEAF_STEPS = [
  SET_STEP,
  COMPUTER_AUDIO_STEP,
  COMPUTER_DISPLAY_STEP,
  z.strictObject({ do: z.literal('scene'), ...NODE, scene: ID }),
  z.strictObject({ do: z.literal('wait'), ...NODE, ms: DURATION_MS }),
  z.strictObject({ do: z.literal('notify'), ...NODE, message: TEXT }),
  z.strictObject({
    do: z.literal('ai'),
    ...NODE,
    person: ID,
    chat: ID.optional(),
    instruction: TEXT,
  }),
  z.strictObject({
    do: z.literal('tool'),
    ...NODE,
    person: ID,
    tool: TEXT,
    args: z.record(z.string(), JSON_VALUE).optional(),
  }),
  z
    .strictObject({
      do: z.literal('value'),
      ...NODE,
      value: ID,
      op: z.enum(VALUE_OPERATIONS),
      amount: INPUT.optional(),
    })
    .refine((step) => HAS_AMOUNT.has(step.op) === (step.amount !== undefined), {
      message: 'set, add and subtract need an amount; the other operations take none',
    }),
  z.strictObject({
    do: z.literal('run'),
    ...NODE,
    automation: ID,
    inputs: z.record(z.string(), INPUT).optional(),
    wait: z.boolean().optional(),
  }),
  z.strictObject({
    do: z.literal('stop'),
    ...NODE,
    automation: ID.optional(),
    key: TEXT.optional(),
  }),
] as const;
export type LeafStepV2 = z.infer<(typeof LEAF_STEPS)[number]>;

export interface IfBranchV2 {
  readonly id?: string | undefined;
  readonly when: ConditionV2;
  readonly then: readonly StepV2[];
}
export interface IfStepV2 {
  readonly do: 'if';
  readonly id?: string | undefined;
  readonly branches: readonly IfBranchV2[];
  readonly else?: readonly StepV2[] | undefined;
}
export interface RepeatStepV2 {
  readonly do: 'repeat';
  readonly id?: string | undefined;
  readonly times?: number | undefined;
  readonly while?: ConditionV2 | undefined;
  readonly until?: ConditionV2 | undefined;
  readonly gapMs?: number | undefined;
  readonly limitMs?: number | undefined;
  readonly steps: readonly StepV2[];
}
export type StepV2 = LeafStepV2 | IfStepV2 | RepeatStepV2;

const NESTED = z.lazy(() => z.array(STEP_V2));
const IF_STEP = z.strictObject({
  do: z.literal('if'),
  ...NODE,
  branches: z.array(z.strictObject({ ...NODE, when: CONDITION_V2, then: NESTED })).min(1),
  else: NESTED.optional(),
});
const REPEAT_STEP = z
  .strictObject({
    do: z.literal('repeat'),
    ...NODE,
    times: z.int().min(1).optional(),
    while: CONDITION_V2.optional(),
    until: CONDITION_V2.optional(),
    gapMs: z.int().min(100).optional(),
    limitMs: DURATION_MS.optional(),
    steps: NESTED.refine((steps) => steps.length > 0, { message: 'A repeat needs a step' }),
  })
  .refine(
    (step) =>
      [step.times, step.while, step.until].filter((entry) => entry !== undefined).length === 1,
    { message: 'A repeat step needs exactly one of times, while and until' },
  );
export const STEP_V2: z.ZodType<StepV2> = z.lazy(() =>
  z.discriminatedUnion('do', [...LEAF_STEPS, IF_STEP, REPEAT_STEP]),
);

const INPUT_TYPES = ['flag', 'number', 'duration', 'choice', 'text'] as const;
const RUN_MODES = ['single', 'restart', 'queue', 'parallel'] as const;
const INPUT_DECLARATION = z.strictObject({ name: TEXT, type: z.enum(INPUT_TYPES) });
export type InputDeclarationV2 = z.infer<typeof INPUT_DECLARATION>;

export function stepChildren(step: StepV2): readonly StepV2[] {
  if (step.do === 'if')
    return [...step.branches.flatMap((branch) => branch.then), ...(step.else ?? [])];
  return step.do === 'repeat' ? step.steps : [];
}

export function walkSteps(steps: readonly StepV2[]): readonly StepV2[] {
  return steps.flatMap((step) => [step, ...walkSteps(stepChildren(step))]);
}

function nodeIds(definition: {
  readonly when: readonly TriggerV2[];
  readonly steps: readonly StepV2[];
}): readonly (string | undefined)[] {
  const steps = walkSteps(definition.steps);
  return [
    ...definition.when.map((trigger) => trigger.id),
    ...steps.map((step) => step.id),
    ...steps.flatMap((step) => (step.do === 'if' ? step.branches.map((branch) => branch.id) : [])),
  ];
}

export const AUTOMATION_V2 = z
  .strictObject({
    when: z.array(TRIGGER_V2),
    onlyIf: CONDITION_V2.optional(),
    steps: z.array(STEP_V2).min(1),
    inputs: z.array(INPUT_DECLARATION).optional(),
    mode: z.enum(RUN_MODES).optional(),
    max: z.int().min(1).optional(),
    key: TEXT.optional(),
  })
  .refine(
    (automation) =>
      new Set(automation.inputs?.map((input) => input.name)).size ===
      (automation.inputs?.length ?? 0),
    { message: 'Input names must be unique' },
  )
  .refine(
    (automation) => {
      const ids = nodeIds(automation).filter((id) => id !== undefined);
      return new Set(ids).size === ids.length;
    },
    { message: 'Node identities must be unique' },
  )
  .refine((automation) => automation.inputs === undefined || automation.when.length === 0, {
    message: 'Inputs belong to automations without triggers',
  })
  .refine(
    (automation) =>
      automation.mode === 'queue'
        ? automation.max !== undefined
        : automation.max === undefined || automation.mode === 'parallel',
    { message: 'max belongs to the queue and parallel modes, and queue needs it' },
  );
export type AutomationV2 = z.infer<typeof AUTOMATION_V2>;

export const EDIT_AUTOMATION_V2 = z.strictObject({
  action: z.enum(['create', 'update', 'remove', 'enable', 'disable']),
  id: ID.optional(),
  name: TEXT.optional(),
  revision: z.int().optional(),
  automation: AUTOMATION_V2.optional(),
});
export type EditAutomationV2 = z.infer<typeof EDIT_AUTOMATION_V2>;
