import type { PrinterSupplyKind, PrinterSupplySlot } from './printer-supplies';
import { splitReason, type PrinterProblem } from './printer-reasons';
import { slotLabel } from './printer-supplies';

export const PRINTER_STATES = ['idle', 'printing', 'stopped'] as const;

export type PrinterStateValue = (typeof PRINTER_STATES)[number];

export const PRINTER_QUEUE_STATES = ['running', 'paused'] as const;

export type PrinterQueueState = (typeof PRINTER_QUEUE_STATES)[number];

export const PRINTER_POWER_STATES = ['awake', 'standby', 'hibernate', 'off'] as const;

export type PrinterPowerState = (typeof PRINTER_POWER_STATES)[number];

export const DEFAULT_LOW_PERCENT = 15;

export const DAYS_LEFT_LOW = 7;

const POWER_REASONS: ReadonlyMap<string, PrinterPowerState> = new Map([
  ['standby', 'standby'],
  ['hibernate', 'hibernate'],
  ['suspend', 'hibernate'],
  ['power-down', 'off'],
  ['shutdown', 'off'],
]);

export function powerStateOf(reasons: readonly string[]): PrinterPowerState {
  for (const keyword of reasons) {
    const power = POWER_REASONS.get(splitReason(keyword).base);
    if (power !== undefined) return power;
  }
  return 'awake';
}

export function isPausedByReasons(reasons: readonly string[]): boolean {
  return reasons.some((keyword) => {
    const { base } = splitReason(keyword);
    return base === 'paused' || base === 'moving-to-paused';
  });
}

export function stateValueOf(state: 'idle' | 'processing' | 'stopped'): PrinterStateValue {
  return state === 'processing' ? 'printing' : state;
}

export interface SupplyInput {
  readonly key: string;
  readonly slot: PrinterSupplySlot;
  readonly kind: PrinterSupplyKind;
  readonly consumed: boolean;
  readonly level: number | null;
  readonly lowLevel: number | null;
  readonly daysLeft: number | null;
}

export type SupplyStanding = 'ok' | 'low' | 'out' | 'unknown';

export interface SupplyStatus extends SupplyInput {
  readonly standing: SupplyStanding;
  readonly threshold: number;
}

const LOW_REASONS: ReadonlySet<string> = new Set([
  'toner-low',
  'marker-supply-low',
  'marker-ink-almost-empty',
  'marker-toner-almost-empty',
  'developer-low',
  'opc-near-eol',
  'marker-supply-almost-empty',
]);

const OUT_REASONS: ReadonlySet<string> = new Set([
  'toner-empty',
  'marker-supply-empty',
  'marker-ink-empty',
  'marker-toner-empty',
  'developer-empty',
  'opc-life-over',
]);

const WASTE_LOW_REASONS: ReadonlySet<string> = new Set([
  'marker-waste-almost-full',
  'marker-waste-ink-receptacle-almost-full',
  'marker-waste-toner-receptacle-almost-full',
]);

const WASTE_OUT_REASONS: ReadonlySet<string> = new Set([
  'marker-waste-full',
  'marker-waste-ink-receptacle-full',
  'marker-waste-toner-receptacle-full',
]);

export interface StandingOptions {
  readonly thresholds: Readonly<Record<string, number>>;
  readonly lowDays?: number;
}

function thresholdOf(input: SupplyInput, options: StandingOptions): number {
  const configured = options.thresholds[input.key];
  if (configured !== undefined) return configured;
  return input.lowLevel !== null && input.lowLevel > 0 ? input.lowLevel : DEFAULT_LOW_PERCENT;
}

function levelStanding(input: SupplyInput, threshold: number, lowDays: number): SupplyStanding {
  const { level } = input;
  if (level === null) return 'unknown';
  if (!input.consumed) {
    if (level >= 100) return 'out';
    return level >= 100 - threshold ? 'low' : 'ok';
  }
  if (level <= 0) return 'out';
  const early = input.daysLeft !== null && input.daysLeft < lowDays;
  return level <= threshold || early ? 'low' : 'ok';
}

function lowestConsumed(statuses: readonly SupplyStatus[]): number {
  let best = -1;
  let bestLevel = Number.POSITIVE_INFINITY;
  statuses.forEach((status, index) => {
    if (status.consumed && status.level !== null && status.level < bestLevel) {
      best = index;
      bestLevel = status.level;
    }
  });
  return best;
}

function attribute(
  statuses: readonly SupplyStatus[],
  index: number,
  standing: SupplyStanding,
): readonly SupplyStatus[] {
  return statuses.map((status, position) =>
    position === index && status.standing !== 'out' ? { ...status, standing } : status,
  );
}

export function supplyStandings(
  inputs: readonly SupplyInput[],
  reasons: readonly string[],
  options: StandingOptions,
): readonly SupplyStatus[] {
  const lowDays = options.lowDays ?? DAYS_LEFT_LOW;
  let statuses: readonly SupplyStatus[] = inputs.map((input) => {
    const threshold = thresholdOf(input, options);
    return { ...input, threshold, standing: levelStanding(input, threshold, lowDays) };
  });
  const bases = new Set(reasons.map((keyword) => splitReason(keyword).base));
  const wasteIndex = statuses.findIndex((status) => !status.consumed);
  const hit = (set: ReadonlySet<string>): boolean => [...bases].some((base) => set.has(base));
  if (hit(OUT_REASONS) && !statuses.some((s) => s.consumed && s.standing === 'out')) {
    statuses = attribute(statuses, lowestConsumed(statuses), 'out');
  }
  if (
    hit(LOW_REASONS) &&
    !statuses.some((s) => s.consumed && s.standing !== 'ok' && s.standing !== 'unknown')
  ) {
    statuses = attribute(statuses, lowestConsumed(statuses), 'low');
  }
  if (hit(WASTE_OUT_REASONS)) statuses = attribute(statuses, wasteIndex, 'out');
  if (hit(WASTE_LOW_REASONS)) statuses = attribute(statuses, wasteIndex, 'low');
  return statuses;
}

export function lowestSupply(statuses: readonly SupplyStatus[]): SupplyStatus | null {
  const index = lowestConsumed(statuses);
  return statuses[index] ?? null;
}

export interface AttentionSummary {
  readonly out: readonly SupplyStatus[];
  readonly low: readonly SupplyStatus[];
  readonly problems: readonly PrinterProblem[];
}

export function attentionOf(
  statuses: readonly SupplyStatus[],
  problems: readonly PrinterProblem[],
): AttentionSummary {
  return {
    out: statuses.filter((status) => status.standing === 'out'),
    low: statuses.filter((status) => status.standing === 'low'),
    problems: problems.filter(
      (problem) => problem.part !== 'cartridge' && problem.part !== 'waste',
    ),
  };
}

export type SummaryTone = 'ok' | 'busy' | 'warn' | 'error' | 'asleep' | 'paused';

export interface PrinterSummary {
  readonly tone: SummaryTone;
  readonly text: string;
}

export interface SummaryInput {
  readonly state: PrinterStateValue;
  readonly power: PrinterPowerState;
  readonly paused: boolean;
  readonly attention: AttentionSummary;
}

function namesOf(statuses: readonly [SupplyStatus, ...SupplyStatus[]], verb: string): string {
  const [first, ...rest] = statuses;
  return rest.length === 0
    ? `${slotLabel(first.slot)} is ${verb}`
    : `${String(rest.length + 1)} supplies are ${verb}`;
}

function nonEmpty(
  statuses: readonly SupplyStatus[],
): readonly [SupplyStatus, ...SupplyStatus[]] | null {
  const [first, ...rest] = statuses;
  return first === undefined ? null : [first, ...rest];
}

function attentionSummary(input: SummaryInput): PrinterSummary | null {
  const { attention } = input;
  const [problem] = attention.problems;
  if (input.state === 'stopped') return { tone: 'error', text: problem?.title ?? 'Stopped' };
  const out = nonEmpty(attention.out);
  if (out !== null) return { tone: 'error', text: namesOf(out, 'empty') };
  return problem?.severity === 'error' ? { tone: 'error', text: problem.title } : null;
}

function calmSummary(input: SummaryInput): PrinterSummary {
  const { attention } = input;
  if (input.power !== 'awake') return { tone: 'asleep', text: 'Asleep' };
  if (input.paused) return { tone: 'paused', text: 'Paused' };
  if (input.state === 'printing') return { tone: 'busy', text: 'Printing' };
  const low = nonEmpty(attention.low);
  if (low !== null) return { tone: 'warn', text: namesOf(low, 'low') };
  const [problem] = attention.problems;
  return problem === undefined
    ? { tone: 'ok', text: 'Ready' }
    : { tone: 'warn', text: problem.title };
}

export function printerSummary(input: SummaryInput): PrinterSummary {
  return attentionSummary(input) ?? calmSummary(input);
}
