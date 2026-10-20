import type { NodeKind, PortValue, TriggerNode } from '@smarteverything/domain';
import { durationWords } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import { portOps } from '../inspector/sections/edits';

export type TimingName = 'window' | 'debounce' | 'hold' | 'silentFor' | 'cooldown' | 'rearm';

export const TIMING_NAMES: readonly TimingName[] = [
  'window',
  'debounce',
  'hold',
  'silentFor',
  'cooldown',
  'rearm',
];

export interface TimingText {
  readonly title: string;
  readonly explain: string;
}

export const TIMING_TEXT: Readonly<Record<TimingName, TimingText>> = {
  window: {
    title: 'Look at a stretch of values',
    explain: 'Judge the average, lowest, highest, rate or count over a rolling window.',
  },
  debounce: {
    title: 'Wait for things to settle',
    explain: 'Decide only after no new signal arrived for this long.',
  },
  hold: {
    title: 'Hold',
    explain: 'The test must stay true this long before it fires.',
  },
  silentFor: {
    title: 'Silence',
    explain: 'Fire when no matching signal arrived for this long.',
  },
  cooldown: {
    title: 'Cooldown',
    explain: 'After firing, ignore new triggers for this long.',
  },
  rearm: {
    title: 'Re-arm',
    explain: 'After firing, fire again only once the value has crossed back past this.',
  },
};

export const WINDOW_MODES = [
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Lowest' },
  { value: 'max', label: 'Highest' },
  { value: 'rate', label: 'Per minute' },
  { value: 'count', label: 'Count' },
] as const;

export interface WindowSetting {
  readonly of: string;
  readonly seconds: number;
}

export const DEFAULT_WINDOW: WindowSetting = { of: 'avg', seconds: 60 };

export const DEFAULT_MS: Readonly<Record<'debounce' | 'hold' | 'silentFor' | 'cooldown', number>> =
  {
    debounce: 2000,
    hold: 10_000,
    silentFor: 300_000,
    cooldown: 60_000,
  };

export const DEFAULT_REARM = 0;

export interface TimingValues {
  readonly window: WindowSetting | undefined;
  readonly debounce: number | undefined;
  readonly hold: number | undefined;
  readonly silentFor: number | undefined;
  readonly cooldown: number | undefined;
  readonly rearm: number | undefined;
}

function literalOf(node: TriggerNode, name: string): unknown {
  const port = node.ports[name];
  return port !== undefined && 'lit' in port ? port.lit : undefined;
}

function milliseconds(value: unknown): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined;
}

function windowOf(value: unknown): WindowSetting | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const of: unknown = Reflect.get(value, 'of');
  const seconds: unknown = Reflect.get(value, 'seconds');
  if (typeof of !== 'string' || typeof seconds !== 'number' || seconds <= 0) return undefined;
  return { of, seconds };
}

export function timingValuesOf(node: TriggerNode): TimingValues {
  const rearm = literalOf(node, 'rearm');
  return {
    window: windowOf(literalOf(node, 'window')),
    debounce: milliseconds(literalOf(node, 'debounce')),
    hold: milliseconds(literalOf(node, 'hold')),
    silentFor: milliseconds(literalOf(node, 'silentFor')),
    cooldown: milliseconds(literalOf(node, 'cooldown')),
    rearm: typeof rearm === 'number' ? rearm : undefined,
  };
}

export function timingNamesOf(kind: NodeKind | undefined): readonly TimingName[] {
  if (kind === undefined) return [];
  const declared = new Set(kind.inputs.map((input) => input.name));
  return TIMING_NAMES.filter((name) => declared.has(name));
}

export function timingOps(
  key: string,
  name: TimingName,
  value: PortValue | null,
): readonly PatchOp[] {
  return portOps(key, name, value);
}

export function defaultTiming(name: TimingName): PortValue {
  if (name === 'window') return { lit: { ...DEFAULT_WINDOW } };
  if (name === 'rearm') return { lit: DEFAULT_REARM };
  return { lit: DEFAULT_MS[name] };
}

export type StripPhase = 'before' | 'after';

export interface StripBar {
  readonly name: TimingName;
  readonly phase: StripPhase;
  readonly label: string;
  readonly caption: string;
  readonly weight: number;
}

export const MOST_WEIGHT = 12;

function weightOf(milliseconds: number): number {
  return Math.min(MOST_WEIGHT, Math.max(1, Math.round(Math.log2(1 + milliseconds / 1000))));
}

function bar(name: TimingName, phase: StripPhase, label: string, ms: number): StripBar {
  return { name, phase, label, caption: durationWords(ms / 1000), weight: weightOf(ms) };
}

function windowBar(setting: WindowSetting | undefined): StripBar[] {
  if (setting === undefined) return [];
  const label = WINDOW_MODES.find((mode) => mode.value === setting.of)?.label ?? 'Window';
  return [bar('window', 'before', label, setting.seconds * 1000)];
}

function before(values: TimingValues): StripBar[] {
  const rows: StripBar[] = windowBar(values.window);
  if (values.debounce !== undefined)
    rows.push(bar('debounce', 'before', 'Settle', values.debounce));
  if (values.hold !== undefined) rows.push(bar('hold', 'before', 'Hold', values.hold));
  if (values.silentFor !== undefined)
    rows.push(bar('silentFor', 'before', 'Silence', values.silentFor));
  return rows;
}

export function stripBars(values: TimingValues): readonly StripBar[] {
  const rows = before(values);
  if (values.cooldown !== undefined)
    rows.push(bar('cooldown', 'after', 'Cooldown', values.cooldown));
  return rows;
}

export function stripSummary(values: TimingValues): string {
  const bars = stripBars(values);
  if (bars.length === 0 && values.rearm === undefined) {
    return 'It fires as soon as the trigger matches.';
  }
  const steps = [
    ...bars
      .filter((entry) => entry.phase === 'before')
      .map((entry) => `${entry.label} ${entry.caption}`),
    'fires',
    ...bars
      .filter((entry) => entry.phase === 'after')
      .map((entry) => `${entry.label} ${entry.caption}`),
  ];
  const rearm =
    values.rearm === undefined
      ? ''
      : ` It fires again after the value crosses back past ${String(values.rearm)}.`;
  return `${steps.join(', then ')}.${rearm}`;
}
