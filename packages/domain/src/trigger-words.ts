import type { SignalTest } from './signal-timing';
import { cameraDetectionOf, type EventKind } from './events';
import type { SignalKindSpec } from './signal-sources/spec';
import type { JsonValue } from './values';

export type AmountText = (value: JsonValue) => string;

export interface BooleanWords {
  readonly verb: string;
  readonly stays: string;
}

interface BooleanPair {
  readonly on: BooleanWords;
  readonly off: BooleanWords;
}

const BOOLEAN_VERBS: Readonly<Record<string, BooleanPair>> = {
  power: {
    on: { verb: 'turns on', stays: 'on' },
    off: { verb: 'turns off', stays: 'off' },
  },
  contact: {
    on: { verb: 'opens', stays: 'open' },
    off: { verb: 'closes', stays: 'closed' },
  },
  lock: {
    on: { verb: 'locks', stays: 'locked' },
    off: { verb: 'unlocks', stays: 'unlocked' },
  },
  motion: {
    on: { verb: 'detects motion', stays: 'detecting motion' },
    off: { verb: 'stops detecting motion', stays: 'clear of motion' },
  },
  occupancy: {
    on: { verb: 'becomes occupied', stays: 'occupied' },
    off: { verb: 'becomes empty', stays: 'empty' },
  },
  leak: {
    on: { verb: 'detects a leak', stays: 'leaking' },
    off: { verb: 'is dry again', stays: 'dry' },
  },
  smoke: {
    on: { verb: 'detects smoke', stays: 'smoky' },
    off: { verb: 'clears of smoke', stays: 'clear of smoke' },
  },
  gas: {
    on: { verb: 'detects gas', stays: 'gassy' },
    off: { verb: 'clears of gas', stays: 'clear of gas' },
  },
};

const TEST_WORDS = {
  eq: 'becomes',
  ne: 'stops being',
  gt: 'rises above',
  gte: 'reaches',
  lt: 'falls below',
  lte: 'falls to',
} as const;

export function booleanWords(
  field: string | undefined,
  test: SignalTest | undefined,
): BooleanWords | null {
  const pair = field === undefined ? undefined : BOOLEAN_VERBS[field];
  if (pair === undefined || test?.is !== 'eq' || typeof test.to !== 'boolean') {
    return null;
  }
  return test.to ? pair.on : pair.off;
}

export function testWords(test: SignalTest | undefined, amount: AmountText): string {
  if (test === undefined) return 'happens';
  if (test.is === 'changed') return 'changes';
  if (test.is === 'between') return `is between ${amount(test.min)} and ${amount(test.max)}`;
  if (test.is === 'in') return `is ${test.to.map(amount).join(' or ')}`;
  return `${TEST_WORDS[test.is]} ${amount(test.to)}`;
}

export function withUnit(amount: string, unit: string | null): string {
  if (unit === null || unit === '') return amount;
  return unit === '%' || unit.startsWith('°') ? `${amount}${unit}` : `${amount} ${unit}`;
}

export function plainAmount(unit: string | null): AmountText {
  return (value) =>
    withUnit(typeof value === 'number' ? String(value) : JSON.stringify(value), unit);
}

export function lowerFirst(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? `${label.charAt(0).toLowerCase()}${label.slice(1)}` : label;
}

export interface MatchContext {
  readonly spec: SignalKindSpec | undefined;
  readonly kind: EventKind | null;
  readonly roomNames: ReadonlyMap<string, string>;
  readonly spoken: ReadonlySet<string>;
}

function matchValueText(
  context: MatchContext,
  key: string,
  value: JsonValue,
  labels: Readonly<Record<string, string>> | undefined,
): string {
  if (key === 'roomId' && typeof value === 'string') {
    return context.roomNames.get(value) ?? 'a removed room';
  }
  return typeof value === 'string' ? (labels?.[value] ?? value) : JSON.stringify(value);
}

export function matchingWords(
  match: Readonly<Record<string, JsonValue>>,
  context: MatchContext,
): string {
  const detection =
    context.kind === null || context.spec === undefined
      ? null
      : cameraDetectionOf(context.kind, match);
  const parts = Object.entries(match).flatMap(([key, value]) => {
    if ((key === 'detection' && detection !== null) || context.spoken.has(key)) return [];
    const entry = context.spec?.match.find((candidate) => candidate.key === key);
    return [`${entry?.label ?? key}: ${matchValueText(context, key, value, entry?.valueLabels)}`];
  });
  return parts.length === 0 ? '' : ` matching ${parts.join(', ')}`;
}
