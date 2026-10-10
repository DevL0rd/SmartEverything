import { CAPABILITY_KEY } from '../capabilities';
import type { SignalInput } from '../signals';

export const SIGNAL_SUBJECTS = [
  'device',
  'camera',
  'profile',
  'client',
  'chat',
  'channel',
  'automation',
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

export interface SignalKindSpec {
  readonly kind: string;
  readonly label: string;
  readonly subject: SignalSubject;
  readonly fields: 'capabilities' | readonly SignalFieldSpec[];
  readonly pulse: boolean;
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

function fieldAllowed(spec: SignalKindSpec, field: string | null): boolean {
  if (spec.fields === 'capabilities') {
    return CAPABILITY_KEY.safeParse(field).success;
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
