import {
  CAPABILITY_KEY,
  EVENT_KINDS,
  SIGNAL_SOURCES,
  SIGNAL_TRIGGER,
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
  trigger: Pick<SignalTrigger, 'type'>,
  source: string,
  kind: SignalKindSpec,
): SignalTrigger {
  const first = kind.fields === 'capabilities' ? undefined : kind.fields[0];
  return SIGNAL_TRIGGER.parse({
    type: trigger.type,
    source,
    kind: kind.kind,
    field: kind.pulse || first === undefined ? null : first.field,
    comparison: kind.pulse ? null : { operator: 'changed' },
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
): Pick<SignalTrigger, 'window' | 'debounceSeconds' | 'holdSeconds' | 'cooldownSeconds' | 'match'> {
  return {
    window: timing.window,
    debounceSeconds: timing.debounceSeconds,
    holdSeconds: timing.holdSeconds,
    cooldownSeconds: timing.cooldownSeconds,
    match: {},
  };
}

export function withTiming(base: TimedBase, timing: SignalTiming): Trigger {
  if (untimed(timing)) {
    return base;
  }
  if (base.type === 'state') {
    return {
      type: 'signal',
      source: 'device',
      kind: 'state',
      subject: base.deviceId,
      field: base.capability,
      comparison: base.comparison,
      ...timingFields(timing),
    };
  }
  return {
    type: 'signal',
    source: 'event',
    kind: base.kind,
    subject: base.deviceId,
    field: null,
    comparison: timing.window === null ? null : { operator: 'gte', value: timing.atLeast },
    ...timingFields(timing),
  };
}
