import { z } from 'zod';
import { OPENROUTER_CREDITS } from './ai-models';
import type { UsageWork } from './ai-usage';

const USD = z.number().min(0.01).max(100_000);

export const AI_BUDGET_KEY = 'budget';

export const BURN_MINUTES_MIN = 5;
export const BURN_MINUTES_MAX = 1440;

export const AI_BURN_RULE = z.strictObject({
  usd: USD,
  minutes: z.int().min(BURN_MINUTES_MIN).max(BURN_MINUTES_MAX),
});

export type AiBurnRule = z.output<typeof AI_BURN_RULE>;

export const AI_BUDGET_SETTINGS = z.strictObject({
  daily_usd: USD.nullable().default(null),
  monthly_usd: USD.nullable().default(null),
  warn_at_percent: z.int().min(10).max(99).default(80),
  burn: AI_BURN_RULE.nullable().default(null),
  low_credits_usd: USD.nullable().default(null),
  hard_stop: z.boolean().default(false),
});

export type AiBudgetSettings = z.output<typeof AI_BUDGET_SETTINGS>;

export const AI_BUDGET_CHANGE = AI_BUDGET_SETTINGS.partial().refine(
  (patch) => Object.keys(patch).length > 0,
  { message: 'name at least one field to change' },
);

export type AiBudgetChange = z.output<typeof AI_BUDGET_CHANGE>;

export const BACKGROUND_WORKS: ReadonlySet<UsageWork> = new Set(['subagent', 'wake', 'routine']);

const MICROS = z.int().min(0);

export const AI_BUDGET_PERIOD = z.strictObject({
  from: z.iso.datetime({ offset: true }),
  spent_micros: MICROS,
  limit_micros: MICROS.nullable(),
});

export type AiBudgetPeriod = z.output<typeof AI_BUDGET_PERIOD>;

export const AI_BUDGET_CREDITS = z.union([
  OPENROUTER_CREDITS,
  z.strictObject({ state: z.literal('no_key') }),
  z.strictObject({ state: z.literal('unavailable'), reason: z.string().min(1).max(400) }),
]);

export type AiBudgetCredits = z.output<typeof AI_BUDGET_CREDITS>;

export const AI_BUDGET_STATUS = z.strictObject({
  settings: AI_BUDGET_SETTINGS,
  today: AI_BUDGET_PERIOD,
  month: AI_BUDGET_PERIOD,
  burn: AI_BUDGET_PERIOD.extend({ minutes: z.int().min(1) }).nullable(),
  credits: AI_BUDGET_CREDITS,
  credits_checked_at: z.iso.datetime({ offset: true }).nullable(),
  stopped: z.boolean(),
  reasons: z.array(z.string().min(1).max(200)),
});

export type AiBudgetStatus = z.output<typeof AI_BUDGET_STATUS>;
