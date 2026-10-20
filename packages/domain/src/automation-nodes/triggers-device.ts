import { z } from 'zod';
import { CAMERA_DETECTION_KINDS } from '../events';
import { SIGNAL_MATCHER, type SignalMatcher } from '../signal-matcher';
import { JSON_VALUE, type JsonValue } from '../values';
import { V11_MATCHER_MAPPINGS } from './triggers-v11-signals';

export interface MatcherVariant {
  readonly source?: string;
  readonly kind?: string;
  readonly field?: string;
  readonly match?: Readonly<Record<string, JsonValue>>;
  readonly test?:
    { readonly is: 'eq'; readonly to: boolean } | { readonly is: 'lt'; readonly toPort: string };
}

export interface MatcherMapping {
  readonly variantPort: string | null;
  readonly defaultVariant: string;
  readonly variants: Readonly<Record<string, MatcherVariant>>;
  readonly sourcePort?: string;
  readonly kindPort?: string;
  readonly subjectPort: string | null;
  readonly subjectMatchKey?: string;
  readonly fieldPort: string | null;
  readonly matchRecordPort?: string;
  readonly matchPorts: Readonly<Record<string, string>>;
  readonly requireOneOf?: readonly string[];
  readonly runtimePorts: readonly string[];
}

export type CompiledMatcher =
  | { readonly ok: true; readonly matcher: SignalMatcher }
  | { readonly ok: false; readonly error: string };

type PortValues = Readonly<Record<string, JsonValue | undefined>>;

const TIMING_SECONDS: Readonly<Record<string, string>> = {
  hold: 'holdSeconds',
  debounce: 'debounceSeconds',
  cooldown: 'cooldownSeconds',
  silentFor: 'silentSeconds',
};

export const CAMERA_DETECTION_VARIANTS: Readonly<Record<string, MatcherVariant>> =
  Object.fromEntries(
    Object.entries(CAMERA_DETECTION_KINDS).map(([detection, kind]) => [
      detection,
      { source: 'event', kind, match: { detection } },
    ]),
  );

export const BUTTON_PRESSES = ['single_press', 'double_press', 'long_press'] as const;

export const DEVICE_HEALTH_EVENTS = ['offline', 'online', 'battery_low'] as const;

export const RUN_STATUSES = ['failed', 'succeeded', 'cancelled', 'interrupted'] as const;

export const DEVICE_MATCHER_MAPPINGS: Readonly<Record<string, MatcherMapping>> = {
  ...V11_MATCHER_MAPPINGS,
  'trigger.device': {
    variantPort: null,
    defaultVariant: '',
    variants: { '': { source: 'device', kind: 'state' } },
    subjectPort: 'device',
    fieldPort: 'control',
    matchPorts: { room: 'roomId', family: 'family', role: 'role', cause: 'cause' },
    requireOneOf: ['device', 'room', 'family', 'role'],
    runtimePorts: ['ignoreOwnChanges'],
  },
  'trigger.signal': {
    variantPort: null,
    defaultVariant: '',
    variants: { '': {} },
    sourcePort: 'source',
    kindPort: 'kind',
    subjectPort: 'subject',
    fieldPort: 'field',
    matchRecordPort: 'match',
    matchPorts: {},
    runtimePorts: ['ignoreOwnChanges'],
  },
  'trigger.presence': {
    variantPort: 'event',
    defaultVariant: 'arrived',
    variants: {
      arrived: { source: 'plugin_router', kind: 'person_arrived' },
      left: { source: 'plugin_router', kind: 'person_left' },
    },
    subjectPort: null,
    fieldPort: null,
    matchPorts: { person: 'person_id' },
    runtimePorts: ['when'],
  },
  'trigger.camera': {
    variantPort: 'detection',
    defaultVariant: 'motion',
    variants: CAMERA_DETECTION_VARIANTS,
    subjectPort: 'camera',
    fieldPort: null,
    matchPorts: {},
    runtimePorts: [],
  },
  'trigger.button': {
    variantPort: null,
    defaultVariant: '',
    variants: { '': { source: 'event', kind: 'button' } },
    subjectPort: 'device',
    fieldPort: null,
    matchPorts: { press: 'action' },
    runtimePorts: [],
  },
  'trigger.value': {
    variantPort: null,
    defaultVariant: '',
    variants: { '': { source: 'automation_value', kind: 'changed', field: 'value' } },
    subjectPort: 'value',
    fieldPort: null,
    matchPorts: {},
    runtimePorts: ['ignoreOwnChanges'],
  },
  'trigger.run_status': {
    variantPort: null,
    defaultVariant: '',
    variants: { '': { source: 'automation_run', kind: 'status' } },
    subjectPort: 'automation',
    fieldPort: null,
    matchPorts: { status: 'status' },
    runtimePorts: [],
  },
  'trigger.device_health': {
    variantPort: 'event',
    defaultVariant: 'offline',
    variants: {
      offline: { source: 'device', kind: 'online', test: { is: 'eq', to: false } },
      online: { source: 'device', kind: 'online', test: { is: 'eq', to: true } },
      battery_low: {
        source: 'device',
        kind: 'state',
        field: 'battery',
        test: { is: 'lt', toPort: 'battery' },
      },
    },
    subjectPort: 'device',
    fieldPort: null,
    matchPorts: { room: 'roomId', family: 'family' },
    runtimePorts: ['ignoreOwnChanges'],
  },
};

function textOf(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

const JSON_RECORD = z.record(z.string(), JSON_VALUE);

function recordOf(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> {
  const parsed = JSON_RECORD.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function variantOf(mapping: MatcherMapping, ports: PortValues): MatcherVariant | undefined {
  if (mapping.variantPort === null) return mapping.variants[''];
  const chosen = textOf(ports[mapping.variantPort]) ?? mapping.defaultVariant;
  return Object.hasOwn(mapping.variants, chosen) ? mapping.variants[chosen] : undefined;
}

function matchOf(
  mapping: MatcherMapping,
  variant: MatcherVariant,
  ports: PortValues,
): Record<string, JsonValue> | undefined {
  const match: Record<string, JsonValue> = { ...variant.match };
  if (mapping.matchRecordPort !== undefined) {
    Object.assign(match, recordOf(ports[mapping.matchRecordPort]));
  }
  for (const [port, key] of Object.entries(mapping.matchPorts)) {
    const value = ports[port];
    if (value !== undefined) match[key] = value;
  }
  return Object.keys(match).length === 0 ? undefined : match;
}

function timingOf(variant: MatcherVariant, ports: PortValues): Record<string, unknown> {
  const timing: Record<string, unknown> = {};
  for (const [port, key] of Object.entries(TIMING_SECONDS)) {
    const value = ports[port];
    if (typeof value === 'number') timing[key] = Math.round(value / 1000);
  }
  for (const port of ['test', 'window', 'first', 'rearm']) timing[port] = ports[port];
  const fixed = variant.test;
  if (fixed !== undefined) {
    timing['test'] = { is: fixed.is, to: fixed.is === 'eq' ? fixed.to : ports[fixed.toPort] };
  }
  return timing;
}

function missingPort(
  mapping: MatcherMapping,
  variant: MatcherVariant,
  ports: PortValues,
): string | null {
  if (variant.test?.is === 'lt' && typeof ports[variant.test.toPort] !== 'number') {
    return `Set ${variant.test.toPort}`;
  }
  const choices = mapping.requireOneOf ?? [];
  return choices.length > 0 && choices.every((port) => ports[port] === undefined)
    ? `Set one of ${choices.join(', ')}`
    : null;
}

function candidateOf(
  mapping: MatcherMapping,
  variant: MatcherVariant,
  ports: PortValues,
): Record<string, unknown> {
  const dynamic = (port: string | null | undefined): string | undefined =>
    textOf(ports[port ?? '']);
  return {
    source: mapping.sourcePort === undefined ? variant.source : dynamic(mapping.sourcePort),
    kind: mapping.kindPort === undefined ? variant.kind : dynamic(mapping.kindPort),
    subject: dynamic(mapping.subjectPort),
    field: dynamic(mapping.fieldPort) ?? variant.field,
    match: matchOf(mapping, variant, ports),
    ...timingOf(variant, ports),
  };
}

export function compileTriggerMatcher(kindId: string, ports: PortValues): CompiledMatcher {
  const mapping = DEVICE_MATCHER_MAPPINGS[kindId];
  if (mapping === undefined) return { ok: false, error: `${kindId} does not compile to a matcher` };
  const variant = variantOf(mapping, ports);
  if (variant === undefined) return { ok: false, error: 'That choice is not offered here' };
  const missing = missingPort(mapping, variant, ports);
  if (missing !== null) return { ok: false, error: missing };
  const parsed = SIGNAL_MATCHER.safeParse(candidateOf(mapping, variant, ports));
  return parsed.success
    ? { ok: true, matcher: parsed.data }
    : { ok: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') };
}
