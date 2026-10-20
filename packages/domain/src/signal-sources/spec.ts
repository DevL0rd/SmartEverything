import { CAPABILITY_KEY } from '../capabilities';
import type { SignalInput } from '../signals';
import type { JsonValue } from '../values';

export const SIGNAL_SUBJECTS = [
  'device',
  'camera',
  'profile',
  'client',
  'chat',
  'channel',
  'automation',
  'automation_value',
  'schedule',
  'planner_item',
  'none',
] as const;

export type SignalSubject = (typeof SIGNAL_SUBJECTS)[number];

export interface SignalFieldSpec {
  readonly field: string;
  readonly label: string;
  readonly unit: string | null;
}

export interface SignalMatchSpec {
  readonly key: string;
  readonly label: string;
  readonly values: readonly string[] | null;
  readonly valueLabels?: Readonly<Record<string, string>>;
}

export interface SignalStatesSpec {
  readonly on: string;
  readonly off: string;
}

export interface SignalSpanSpec {
  readonly quietSeconds: number;
}

export interface SignalFeedWhen {
  readonly key: string;
  readonly values: readonly string[];
}

export interface SignalKindSpec {
  readonly kind: string;
  readonly label: string;
  readonly subject: SignalSubject;
  readonly fields: 'capabilities' | 'free' | readonly SignalFieldSpec[];
  readonly match: readonly SignalMatchSpec[];
  readonly pulse: boolean;
  readonly states?: SignalStatesSpec;
  readonly feed?: boolean;
  readonly feedWhen?: SignalFeedWhen;
  readonly span?: SignalSpanSpec;
  readonly icon?: string;
  readonly urgent?: boolean;
  readonly ownerOnly?: boolean;
  readonly transient?: boolean;
  readonly optIn?: boolean;
}

export interface SignalSourceSpec {
  readonly source: string;
  readonly label: string;
  readonly kinds: readonly SignalKindSpec[];
}

export function kindSpecOf(
  sources: readonly SignalSourceSpec[],
  signal: Pick<SignalInput, 'source' | 'kind'>,
): SignalKindSpec | undefined {
  return sources
    .find((spec) => spec.source === signal.source)
    ?.kinds.find((kind) => kind.kind === signal.kind);
}

export function signalFeeds(
  spec: Pick<SignalKindSpec, 'feed' | 'feedWhen'>,
  signal: Pick<SignalInput, 'data'>,
): boolean {
  if (spec.feed !== true) {
    return false;
  }
  const { feedWhen } = spec;
  if (feedWhen === undefined) {
    return true;
  }
  const actual = signal.data[feedWhen.key];
  return typeof actual === 'string' && feedWhen.values.includes(actual);
}

export function compatibleSignalMatch(
  previous: SignalKindSpec | undefined,
  next: SignalKindSpec | undefined,
  match: Readonly<Record<string, JsonValue>>,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(match).filter(([key, value]) => {
      if (previous?.match.some((entry) => entry.key === key) !== true) {
        return true;
      }
      const spec = next?.match.find((entry) => entry.key === key);
      return (
        spec !== undefined &&
        (spec.values === null || spec.values.some((allowed) => allowed === value))
      );
    }),
  );
}

function fieldAllowed(spec: SignalKindSpec, field: string | null): boolean {
  if (spec.fields === 'capabilities') {
    return CAPABILITY_KEY.safeParse(field).success;
  }
  if (spec.fields === 'free') {
    return field !== null;
  }
  return field === null
    ? spec.fields.length === 0
    : spec.fields.some((entry) => entry.field === field);
}

export function signalRegistered(
  sources: readonly SignalSourceSpec[],
  signal: Pick<SignalInput, 'source' | 'kind' | 'field'>,
): boolean {
  const spec = kindSpecOf(sources, signal);
  return spec !== undefined && fieldAllowed(spec, signal.field);
}

export class UnknownSignalError extends Error {
  override readonly name = 'UnknownSignalError';

  constructor(
    readonly source: string,
    readonly kind: string,
  ) {
    super(`No signal "${kind}" from "${source}" exists in this home.`);
  }
}

export class UnknownSignalMatchError extends Error {
  override readonly name = 'UnknownSignalMatchError';

  constructor(
    readonly source: string,
    readonly kind: string,
    readonly key: string,
    readonly allowed: readonly string[],
  ) {
    const known =
      allowed.length === 0 ? 'it has no match keys' : `its keys are ${allowed.join(', ')}`;
    super(`The signal "${kind}" from "${source}" has no match key "${key}"; ${known}.`);
  }
}

export class UnknownSignalMatchValueError extends Error {
  override readonly name = 'UnknownSignalMatchValueError';

  constructor(
    readonly source: string,
    readonly kind: string,
    readonly key: string,
    readonly allowed: readonly string[],
  ) {
    super(
      `The match key "${key}" of the signal "${kind}" from "${source}" takes only ${allowed.join(', ')}.`,
    );
  }
}

export type SignalTriggerError =
  UnknownSignalError | UnknownSignalMatchError | UnknownSignalMatchValueError;

export interface SignalTriggerShape {
  readonly source: string;
  readonly kind: string;
  readonly match: Readonly<Record<string, unknown>>;
}

function matchError(spec: SignalKindSpec, trigger: SignalTriggerShape): SignalTriggerError | null {
  for (const [key, value] of Object.entries(trigger.match)) {
    const entry = spec.match.find((candidate) => candidate.key === key);
    if (entry === undefined) {
      const allowed = spec.match.map((candidate) => candidate.key);
      return new UnknownSignalMatchError(trigger.source, trigger.kind, key, allowed);
    }
    if (entry.values !== null && !entry.values.some((allowed) => allowed === value)) {
      return new UnknownSignalMatchValueError(trigger.source, trigger.kind, key, entry.values);
    }
  }
  return null;
}

export function signalTriggerError(
  sources: readonly SignalSourceSpec[],
  trigger: SignalTriggerShape,
): SignalTriggerError | null {
  const spec = kindSpecOf(sources, trigger);
  return spec === undefined
    ? new UnknownSignalError(trigger.source, trigger.kind)
    : matchError(spec, trigger);
}
