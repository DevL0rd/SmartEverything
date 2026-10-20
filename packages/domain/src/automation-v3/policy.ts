import { z } from 'zod';

export const DURATION_MS = z.int().min(1);

export const ERROR_CLASSES = [
  'Refused',
  'Unreachable',
  'Timeout',
  'Unknown',
  'TypeError',
  'MathError',
  'Invalid',
  'NotFound',
  'Forbidden',
  'LimitExceeded',
  'Failed',
  'BudgetExceeded',
  'Cancelled',
] as const;

export const UNCATCHABLE_ERROR_CLASSES = ['BudgetExceeded', 'Cancelled'] as const;

export const ERROR_CLASS = z.enum(ERROR_CLASSES);

export const CATCHABLE_ERROR_CLASS = ERROR_CLASS.exclude(UNCATCHABLE_ERROR_CLASSES);

export type ErrorClass = z.infer<typeof ERROR_CLASS>;

export const RETRY = z
  .strictObject({
    attempts: z.int().min(1),
    backoff: z.enum(['fixed', 'exponential']),
    initial: DURATION_MS,
    max: DURATION_MS.optional(),
    jitter: z.boolean().optional(),
    on: z
      .array(ERROR_CLASS.exclude(['Unknown']))
      .min(1)
      .optional(),
  })
  .refine((retry) => retry.max === undefined || retry.max >= retry.initial, {
    message: 'max must not be shorter than initial',
    path: ['max'],
  });

export const NODE_POLICY = z.strictObject({
  onError: z.enum(['fail', 'continue', 'route']).optional(),
  retry: RETRY.optional(),
  timeout: DURATION_MS.optional(),
  acknowledgeRepeat: z.boolean().optional(),
});

export type NodePolicy = z.infer<typeof NODE_POLICY>;

export const RUN_MODES = ['single', 'restart', 'queue', 'parallel'] as const;

export const RUN_MODE = z.enum(RUN_MODES);

export type RunMode = z.infer<typeof RUN_MODE>;

export const RUN_POLICY = z.strictObject({
  mode: RUN_MODE,
  max: z.int().min(1).optional(),
  maxWait: DURATION_MS.optional(),
  key: z.string().min(1).optional(),
  timeout: DURATION_MS.optional(),
});

export type RunPolicy = z.infer<typeof RUN_POLICY>;

export const BUDGET_SWITCH = z.enum(['on', 'off']);

export const BUDGET_OVERRIDES = z.strictObject({
  startBucket: BUDGET_SWITCH.optional(),
  feedback: BUDGET_SWITCH.optional(),
  effects: BUDGET_SWITCH.optional(),
  stepsInARow: z.int().min(1).optional(),
  stepsTotal: z.int().min(1).optional(),
  loopIterations: z.int().min(1).optional(),
  ancestry: z.int().min(1).optional(),
  parallelWidthRegion: z.int().min(1).optional(),
  parallelWidthRun: z.int().min(1).optional(),
  commandsPerMinute: z.int().min(1).optional(),
  runStateBytes: z.int().min(1).optional(),
  valueBytes: z.int().min(1).optional(),
});

export type BudgetOverrides = z.infer<typeof BUDGET_OVERRIDES>;

export const LOOP_LIMIT = z.strictObject({
  iterations: z.int().min(1).optional(),
  time: DURATION_MS.optional(),
  onLimit: z.enum(['fail', 'end']),
  note: z.string().min(1).optional(),
});

export type LoopLimit = z.infer<typeof LOOP_LIMIT>;
