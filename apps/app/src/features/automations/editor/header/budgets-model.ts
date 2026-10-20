import type { AutomationV3, BudgetOverrides } from '@smarteverything/domain';
import type { HeaderOp } from '@smarteverything/flow/ops/schema';
import { BUDGET_DEFAULTS } from '@smarteverything/flow/state/budgets';

export type StormName = 'startBucket' | 'feedback' | 'effects';

export interface StormSwitch {
  readonly name: StormName;
  readonly title: string;
  readonly explain: string;
}

export const STORM_SWITCHES: readonly StormSwitch[] = [
  {
    name: 'startBucket',
    title: 'Start limit',
    explain: 'Stops a burst of starts: 10 at once, then 30 a minute.',
  },
  {
    name: 'feedback',
    title: 'Feedback guard',
    explain: 'Does not start when this automation caused its own trigger three times in a row.',
  },
  {
    name: 'effects',
    title: 'Effect limit',
    explain: 'Slows pushes, notices, requests and saved values from a fast loop.',
  },
];

export const STORM_OFF_NOTE = 'Storm protection is off for this automation.';

export type LimitName =
  | 'stepsInARow'
  | 'stepsTotal'
  | 'loopIterations'
  | 'ancestry'
  | 'parallelWidthRegion'
  | 'parallelWidthRun'
  | 'commandsPerMinute';

export interface LimitRow {
  readonly name: LimitName;
  readonly title: string;
  readonly explain: string;
  readonly fallback: number | null;
  readonly start: number;
}

export const LIMIT_ROWS: readonly LimitRow[] = [
  {
    name: 'stepsInARow',
    title: 'Steps in a row',
    explain: 'Steps without waiting or finishing a command.',
    fallback: null,
    start: 20_000,
  },
  {
    name: 'stepsTotal',
    title: 'Steps per run',
    explain: 'All steps one run may take.',
    fallback: null,
    start: 1_000_000,
  },
  {
    name: 'loopIterations',
    title: 'Loop passes',
    explain: 'Passes of one loop in a run.',
    fallback: null,
    start: 100_000,
  },
  {
    name: 'ancestry',
    title: 'Run chain length',
    explain: 'How many automations may start each other in a row.',
    fallback: null,
    start: 8,
  },
  {
    name: 'parallelWidthRegion',
    title: 'Side by side per block',
    explain: 'Branches running at once in one block.',
    fallback: null,
    start: 64,
  },
  {
    name: 'parallelWidthRun',
    title: 'Side by side per run',
    explain: 'Branches running at once in one run.',
    fallback: null,
    start: 256,
  },
  {
    name: 'commandsPerMinute',
    title: 'Commands a minute',
    explain: 'Device commands one run may send each minute.',
    fallback: BUDGET_DEFAULTS.commandsPerMinute,
    start: BUDGET_DEFAULTS.commandsPerMinute,
  },
];

export const NO_LIMIT = 'No limit';

export interface LimitAction {
  readonly label: string;
  readonly next: number | null;
}

export function limitAction(
  row: LimitRow,
  value: number | null,
  custom: boolean,
): LimitAction | null {
  if (value === null) return { label: 'Set a limit', next: row.start };
  if (!custom) return null;
  return { label: row.fallback === null ? NO_LIMIT : 'Use default', next: null };
}

export function stormOn(budgets: BudgetOverrides | undefined, name: StormName): boolean {
  return budgets?.[name] !== 'off';
}

export function stormAllOff(program: AutomationV3): boolean {
  const { budgets } = program;
  return STORM_SWITCHES.every((entry) => budgets?.[entry.name] === 'off');
}

function budgetsOp(budgets: BudgetOverrides): HeaderOp {
  return { op: 'header', budgets: Object.keys(budgets).length === 0 ? null : budgets };
}

export function withStorm(
  budgets: BudgetOverrides | undefined,
  name: StormName,
  on: boolean,
): HeaderOp {
  return budgetsOp({ ...budgets, [name]: on ? 'on' : 'off' });
}

export function stormAllOn(budgets: BudgetOverrides | undefined): HeaderOp {
  return budgetsOp({ ...budgets, startBucket: 'on', feedback: 'on', effects: 'on' });
}

export function limitValue(budgets: BudgetOverrides | undefined, row: LimitRow): number | null {
  return budgets?.[row.name] ?? row.fallback;
}

export function isCustom(budgets: BudgetOverrides | undefined, row: LimitRow): boolean {
  return budgets?.[row.name] !== undefined;
}

export function withLimit(
  budgets: BudgetOverrides | undefined,
  name: LimitName,
  value: number | null,
): HeaderOp {
  const { [name]: _dropped, ...rest } = budgets ?? {};
  return budgetsOp(value === null ? rest : { ...rest, [name]: Math.max(1, Math.round(value)) });
}
