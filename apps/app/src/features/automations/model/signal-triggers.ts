import {
  CAPABILITY_KEY,
  EVENT_KINDS,
  SIGNAL_SOURCES,
  SIGNAL_TRIGGER,
  kindSpecOf,
  compatibleSignalMatch,
  type SignalKindSpec,
  type SignalSourceSpec,
  type SignalTrigger,
  type SignalWindow,
  type SignalWindowMode,
  type Trigger,
  type ValueDescriptor,
} from '@smarteverything/domain';
import { z } from 'zod';

export type TimedBase = Extract<Trigger, { type: 'state' | 'event' }>;

export interface SignalTiming {
  readonly window: SignalWindow | null;
  readonly atLeast: number;
  readonly debounceSeconds: number;
  readonly holdSeconds: number;
  readonly cooldownSeconds: number;
}

export const NO_TIMING: SignalTiming = {
  window: null,
  atLeast: 2,
  debounceSeconds: 0,
  holdSeconds: 0,
  cooldownSeconds: 0,
};

const DEDICATED_SOURCES: ReadonlySet<string> = new Set(['device', 'event', 'weather']);

const EVENT_KIND = z.enum(EVENT_KINDS);

export function genericSources(): readonly SignalSourceSpec[] {
  return SIGNAL_SOURCES.filter((source) => !DEDICATED_SOURCES.has(source.source));
}

export function withKind(
  trigger: Pick<SignalTrigger, 'type'> & Partial<SignalTrigger>,
  source: string,
  kind: SignalKindSpec,
): SignalTrigger {
  if (trigger.source === source && trigger.kind === kind.kind) {
    return SIGNAL_TRIGGER.parse(trigger);
  }
  const first = kind.fields === 'capabilities' ? undefined : kind.fields[0];
  return SIGNAL_TRIGGER.parse({
    type: trigger.type,
    source,
    kind: kind.kind,
    field: kind.pulse || first === undefined ? null : first.field,
    comparison: kind.pulse ? null : { operator: 'changed' },
    match: compatibleSignalMatch(
      kindSpecOf(SIGNAL_SOURCES, {
        source: trigger.source ?? source,
        kind: trigger.kind ?? kind.kind,
      }),
      kind,
      trigger.match ?? {},
    ),
  });
}

export function countComparison(timing: SignalTiming): SignalTrigger['comparison'] {
  return timing.window?.mode === 'count' ? { operator: 'gte', value: timing.atLeast } : null;
}

export function windowModesFor(base: TimedBase, value: ValueDescriptor | null): SignalWindowMode[] {
  if (base.type === 'event') {
    return ['count'];
  }
  return value?.kind === 'number' ? ['avg', 'min', 'max', 'rate'] : [];
}

export function timingOf(trigger: Trigger): SignalTiming {
  if (trigger.type !== 'signal') {
    return NO_TIMING;
  }
  const comparison = trigger.comparison;
  return {
    window: trigger.window,
    atLeast:
      trigger.window?.mode === 'count' && comparison?.operator === 'gte'
        ? comparison.value
        : NO_TIMING.atLeast,
    debounceSeconds: trigger.debounceSeconds,
    holdSeconds: trigger.holdSeconds,
    cooldownSeconds: trigger.cooldownSeconds,
  };
}

function stateBase(trigger: SignalTrigger): TimedBase | null {
  const capability = CAPABILITY_KEY.safeParse(trigger.field);
  if (trigger.subject === null || !capability.success) {
    return null;
  }
  return {
    type: 'state',
    deviceId: trigger.subject,
    capability: capability.data,
    comparison: trigger.comparison ?? { operator: 'changed' },
  };
}

export function baseOf(trigger: Trigger): TimedBase | null {
  if (trigger.type === 'state' || trigger.type === 'event') {
    return trigger;
  }
  if (trigger.type !== 'signal') {
    return null;
  }
  if (trigger.source === 'device' && trigger.kind === 'state') {
    return stateBase(trigger);
  }
  const kind = EVENT_KIND.safeParse(trigger.kind);
  return trigger.source === 'event' && kind.success
    ? { type: 'event', deviceId: trigger.subject, kind: kind.data }
    : null;
}

function untimed(timing: SignalTiming): boolean {
  return (
    timing.window === null &&
    timing.debounceSeconds === 0 &&
    timing.holdSeconds === 0 &&
    timing.cooldownSeconds === 0
  );
}

function timingFields(
  timing: SignalTiming,
): Pick<SignalTrigger, 'window' | 'debounceSeconds' | 'holdSeconds' | 'cooldownSeconds'> {
  return {
    window: timing.window,
    debounceSeconds: timing.debounceSeconds,
    holdSeconds: timing.holdSeconds,
    cooldownSeconds: timing.cooldownSeconds,
  };
}

function originalSignal(base: TimedBase, original: Trigger | undefined): SignalTrigger | null {
  if (original?.type !== 'signal') {
    return null;
  }
  const source = base.type === 'event' ? 'event' : 'device';
  return original.source === source ? original : null;
}

function compatibleMatch(base: TimedBase, original: SignalTrigger | null): SignalTrigger['match'] {
  if (original === null) {
    return {};
  }
  if (base.type === 'state' || base.kind === original.kind) {
    return original.match;
  }
  return compatibleSignalMatch(
    kindSpecOf(SIGNAL_SOURCES, original),
    kindSpecOf(SIGNAL_SOURCES, { source: 'event', kind: base.kind }),
    original.match,
  );
}

function eventComparison(
  timing: SignalTiming,
  original: SignalTrigger | null,
): SignalTrigger['comparison'] {
  if (original !== null) {
    const previous = timingOf(original);
    if (previous.window?.mode === timing.window?.mode && previous.atLeast === timing.atLeast) {
      return original.comparison;
    }
  }
  return countComparison(timing);
}

function stateComparison(
  base: Extract<TimedBase, { type: 'state' }>,
  original: SignalTrigger | null,
): SignalTrigger['comparison'] {
  return original !== null && original.comparison === null && base.comparison.operator === 'changed'
    ? null
    : base.comparison;
}

export function withTiming(base: TimedBase, timing: SignalTiming, original?: Trigger): Trigger {
  const signal = originalSignal(base, original);
  if (untimed(timing) && signal === null) {
    return base;
  }
  const match = compatibleMatch(base, signal);
  if (base.type === 'state') {
    return {
      type: 'signal',
      source: 'device',
      kind: 'state',
      subject: base.deviceId,
      field: base.capability,
      comparison: stateComparison(base, signal),
      match,
      ...timingFields(timing),
    };
  }
  return {
    type: 'signal',
    source: 'event',
    kind: base.kind,
    subject: base.deviceId,
    field: signal?.kind === base.kind ? signal.field : null,
    comparison: eventComparison(timing, signal),
    match,
    ...timingFields(timing),
  };
}
