import type { BudgetOverrides } from '@smarteverything/domain';
import { z } from 'zod';

const MINUTE_MS = 60_000;

export interface BucketRate {
  readonly burst: number;
  readonly perMinute: number;
}

export const BUCKET = z.strictObject({ tokens: z.number().min(0), at: z.int().min(0) });

export type Bucket = z.infer<typeof BUCKET>;

export const PARK_LIMIT_MS = 60_000;

export const SIZE_CHECK_STEP = 64 * 1024;

const NUMERIC_DEFAULTS = {
  commandsPerMinute: 600,
  runStateBytes: 8 * 1024 * 1024,
} as const satisfies Partial<Record<keyof BudgetOverrides, number>>;

export const BUDGET_DEFAULTS = {
  ...NUMERIC_DEFAULTS,
  stepsWarnAt: 100_000,
  runStateWarnBytes: 256 * 1024,
  commandsControl: { burst: 20, perMinute: 120 },
  effectsRun: { burst: 20, perMinute: 60 },
  effectsAutomation: { burst: 60, perMinute: 10 },
  effectsPerson: { burst: 5, perMinute: 10 },
} as const;

export const BUDGET_SCOPES = {
  steps_in_a_row: 'run',
  steps_total: 'run',
  loop_iterations: 'node',
  ancestry: 'run',
  parallel_region: 'run',
  parallel_run: 'run',
  commands: 'run',
  effects: 'run',
  run_state: 'run',
  value_bytes: 'node',
} as const;

export type BudgetName = keyof typeof BUDGET_SCOPES;

export type BreachClass = 'BudgetExceeded' | 'LimitExceeded';

export interface Breach {
  readonly budget: BudgetName;
  readonly limit: number;
  readonly used: number;
}

export function breachClass(budget: BudgetName): BreachClass {
  return BUDGET_SCOPES[budget] === 'run' ? 'BudgetExceeded' : 'LimitExceeded';
}

export interface BudgetLimits {
  readonly stepsInARow: number | null;
  readonly stepsTotal: number | null;
  readonly stepsWarnAt: number;
  readonly loopIterations: number | null;
  readonly ancestry: number | null;
  readonly parallelWidthRegion: number | null;
  readonly parallelWidthRun: number | null;
  readonly runStateWarnBytes: number;
  readonly runStateBytes: number;
  readonly valueBytes: number | null;
  readonly commandsRun: BucketRate;
  readonly commandsControl: BucketRate;
  readonly effectsRun: BucketRate;
  readonly effectsAutomation: BucketRate;
  readonly effectsPerson: BucketRate;
  readonly startBucket: boolean;
  readonly feedback: boolean;
  readonly effects: boolean;
}

function enabled(setting: 'on' | 'off' | undefined): boolean {
  return setting !== 'off';
}

function chosen(value: number | undefined): number | null {
  return value ?? null;
}

export function resolveBudgets(overrides: BudgetOverrides = {}): BudgetLimits {
  const stepsTotal = chosen(overrides.stepsTotal);
  const runStateBytes = overrides.runStateBytes ?? NUMERIC_DEFAULTS.runStateBytes;
  const commandsPerMinute = overrides.commandsPerMinute ?? NUMERIC_DEFAULTS.commandsPerMinute;
  return {
    stepsInARow: chosen(overrides.stepsInARow),
    stepsTotal,
    stepsWarnAt: Math.min(BUDGET_DEFAULTS.stepsWarnAt, stepsTotal ?? BUDGET_DEFAULTS.stepsWarnAt),
    loopIterations: chosen(overrides.loopIterations),
    ancestry: chosen(overrides.ancestry),
    parallelWidthRegion: chosen(overrides.parallelWidthRegion),
    parallelWidthRun: chosen(overrides.parallelWidthRun),
    runStateWarnBytes: Math.min(BUDGET_DEFAULTS.runStateWarnBytes, runStateBytes),
    runStateBytes,
    valueBytes: chosen(overrides.valueBytes),
    commandsRun: { burst: commandsPerMinute, perMinute: commandsPerMinute },
    commandsControl: BUDGET_DEFAULTS.commandsControl,
    effectsRun: BUDGET_DEFAULTS.effectsRun,
    effectsAutomation: BUDGET_DEFAULTS.effectsAutomation,
    effectsPerson: BUDGET_DEFAULTS.effectsPerson,
    startBucket: enabled(overrides.startBucket),
    feedback: enabled(overrides.feedback),
    effects: enabled(overrides.effects),
  };
}

export function fullBucket(rate: BucketRate, now: number): Bucket {
  return { tokens: rate.burst, at: now };
}

export function refilled(bucket: Bucket, rate: BucketRate, now: number): Bucket {
  if (now < bucket.at) return fullBucket(rate, now);
  const gained = ((now - bucket.at) * rate.perMinute) / MINUTE_MS;
  return { tokens: Math.min(rate.burst, bucket.tokens + gained), at: now };
}

function availableAt(bucket: Bucket, rate: BucketRate): number {
  return bucket.at + Math.ceil(((1 - bucket.tokens) * MINUTE_MS) / rate.perMinute);
}

export interface Pending {
  readonly bucket: Bucket;
  readonly rate: BucketRate;
}

export type Admission =
  | { readonly kind: 'go'; readonly buckets: readonly Bucket[] }
  | { readonly kind: 'wait'; readonly until: number; readonly buckets: readonly Bucket[] }
  | { readonly kind: 'exhausted'; readonly buckets: readonly Bucket[] };

export function admit(entries: readonly Pending[], now: number, askedAt: number): Admission {
  const current = entries.map((entry) => ({
    rate: entry.rate,
    bucket: refilled(entry.bucket, entry.rate, now),
  }));
  const empty = current.filter((entry) => entry.bucket.tokens < 1);
  const buckets = current.map((entry) => entry.bucket);
  if (empty.length === 0) {
    return {
      kind: 'go',
      buckets: buckets.map((bucket) => ({ tokens: bucket.tokens - 1, at: bucket.at })),
    };
  }
  const until = Math.max(...empty.map((entry) => availableAt(entry.bucket, entry.rate)));
  return until - askedAt > PARK_LIMIT_MS
    ? { kind: 'exhausted', buckets }
    : { kind: 'wait', until, buckets };
}

export const RUN_BUDGETS = z.strictObject({
  steps: z.int().min(0),
  sinceSuspend: z.int().min(0),
  iterations: z.record(z.string(), z.int().min(0)),
  commands: BUCKET,
  controls: z.record(z.string(), BUCKET),
  effects: BUCKET,
  startedAt: z.int().min(0),
  written: z.int().min(0),
  sizeCheckAt: z.int().min(1),
});

export type RunBudgets = z.infer<typeof RUN_BUDGETS>;

export function startBudgets(limits: BudgetLimits, now: number): RunBudgets {
  return {
    steps: 0,
    sinceSuspend: 0,
    iterations: {},
    commands: fullBucket(limits.commandsRun, now),
    controls: {},
    effects: fullBucket(limits.effectsRun, now),
    startedAt: now,
    written: 0,
    sizeCheckAt: SIZE_CHECK_STEP,
  };
}

export function countStep(budgets: RunBudgets): RunBudgets {
  return { ...budgets, steps: budgets.steps + 1, sinceSuspend: budgets.sinceSuspend + 1 };
}

export function suspended(budgets: RunBudgets): RunBudgets {
  return { ...budgets, sinceSuspend: 0 };
}

export function countIteration(budgets: RunBudgets, path: string): RunBudgets {
  return {
    ...budgets,
    iterations: { ...budgets.iterations, [path]: (budgets.iterations[path] ?? 0) + 1 },
  };
}

export function clearIterations(budgets: RunBudgets, path: string): RunBudgets {
  return {
    ...budgets,
    iterations: Object.fromEntries(
      Object.entries(budgets.iterations).filter(([key]) => key !== path),
    ),
  };
}

function over(budget: BudgetName, used: number, limit: number | null): Breach | null {
  return limit !== null && used > limit ? { budget, limit, used } : null;
}

export function stepBreach(budgets: RunBudgets, limits: BudgetLimits): Breach | null {
  return (
    over('steps_in_a_row', budgets.sinceSuspend, limits.stepsInARow) ??
    over('steps_total', budgets.steps, limits.stepsTotal)
  );
}

export function stepsWarn(budgets: RunBudgets, limits: BudgetLimits): boolean {
  return budgets.steps === limits.stepsWarnAt;
}

export function iterationBreach(used: number, limit: number | null): Breach | null {
  return over('loop_iterations', used, limit);
}

export function ancestryBreach(length: number, limits: BudgetLimits): Breach | null {
  return over('ancestry', length, limits.ancestry);
}

export function parallelBreach(region: number, run: number, limits: BudgetLimits): Breach | null {
  return (
    over('parallel_region', region, limits.parallelWidthRegion) ??
    over('parallel_run', run, limits.parallelWidthRun)
  );
}

export function valueBreach(bytes: number, limits: BudgetLimits): Breach | null {
  return over('value_bytes', bytes, limits.valueBytes);
}

export function stateBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function stateBreach(bytes: number, limits: BudgetLimits): Breach | null {
  return over('run_state', bytes, limits.runStateBytes);
}

export interface SizeCheck<T> {
  readonly value: T;
  readonly breach: Breach | null;
}

export function sizeChecked<T extends { readonly budgets: RunBudgets }>(
  state: T,
  grown: number,
  limits: BudgetLimits,
): SizeCheck<T> {
  if (grown === 0) return { value: state, breach: null };
  const written = state.budgets.written + grown;
  if (written < state.budgets.sizeCheckAt) {
    return { value: { ...state, budgets: { ...state.budgets, written } }, breach: null };
  }
  const bytes = stateBytes(state);
  const budgets = {
    ...state.budgets,
    written,
    sizeCheckAt: written + Math.max(bytes, SIZE_CHECK_STEP),
  };
  return { value: { ...state, budgets }, breach: stateBreach(bytes, limits) };
}

export function stateWarns(bytes: number, limits: BudgetLimits): boolean {
  return bytes >= limits.runStateWarnBytes && bytes <= limits.runStateBytes;
}

export function usedAboveHalf(used: number, limit: number): boolean {
  return used * 2 > limit;
}
