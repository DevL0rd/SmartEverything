import {
  EVENT_KINDS,
  SIGNAL_SOURCES,
  compatibleSignalMatch,
  kindSpecOf,
  type SignalKindSpec,
  type SignalSourceSpec,
  type SignalTriggerV2,
  type SignalWindowMode,
  type ValueDescriptor,
} from '@smarteverything/domain';

type SignalForm = 'device' | 'event' | 'weather' | 'generic';

export interface SignalTiming {
  readonly window: { readonly of: SignalWindowMode; readonly seconds: number } | null;
  readonly atLeast: number;
  readonly debounceSeconds: number;
  readonly holdSeconds: number;
  readonly cooldownSeconds: number;
}

const NO_TIMING: SignalTiming = {
  window: null,
  atLeast: 2,
  debounceSeconds: 0,
  holdSeconds: 0,
  cooldownSeconds: 0,
};

const DEDICATED_SOURCES: ReadonlySet<string> = new Set(['device', 'event', 'weather']);
const EVENT_KIND_NAMES: ReadonlySet<string> = new Set(EVENT_KINDS);
const WEATHER_KIND_FIELD = 'kind';

export function genericSources(): readonly SignalSourceSpec[] {
  return SIGNAL_SOURCES.filter((source) => !DEDICATED_SOURCES.has(source.source));
}

export function formOf(trigger: SignalTriggerV2): SignalForm {
  if (trigger.source === 'device' && trigger.kind === 'state') return 'device';
  if (trigger.source === 'event' && EVENT_KIND_NAMES.has(trigger.kind)) return 'event';
  return trigger.source === 'weather' && trigger.kind === 'forecast' ? 'weather' : 'generic';
}

export function isWeatherKindSignal(trigger: SignalTriggerV2): boolean {
  return trigger.field === WEATHER_KIND_FIELD;
}

function matchFor(kind: SignalKindSpec, previous?: SignalTriggerV2): SignalTriggerV2['match'] {
  const match = compatibleSignalMatch(
    previous === undefined ? undefined : kindSpecOf(SIGNAL_SOURCES, previous),
    kind,
    previous?.match ?? {},
  );
  return Object.keys(match).length === 0 ? undefined : match;
}

export function signalOf(
  source: string,
  kind: SignalKindSpec,
  previous?: SignalTriggerV2,
): SignalTriggerV2 {
  const first = kind.fields === 'capabilities' ? undefined : kind.fields[0];
  const match = matchFor(kind, previous);
  return {
    on: 'signal',
    ...(previous?.id === undefined ? {} : { id: previous.id }),
    source,
    kind: kind.kind,
    ...(kind.pulse || first === undefined ? {} : { field: first.field }),
    ...(kind.pulse ? {} : { test: { is: 'changed' } }),
    ...(match === undefined ? {} : { match }),
  };
}

export function blankSignal(): SignalTriggerV2 | null {
  const source = genericSources()[0];
  const kind = source?.kinds[0];
  return source === undefined || kind === undefined ? null : signalOf(source.source, kind);
}

export function windowModesFor(
  form: SignalForm,
  value: ValueDescriptor | null,
): SignalWindowMode[] {
  if (form === 'event') return ['count'];
  if (form === 'device') return value?.kind === 'number' ? ['avg', 'min', 'max', 'rate'] : [];
  return form === 'generic' ? ['avg', 'min', 'max', 'rate'] : [];
}

export function timingOf(trigger: SignalTriggerV2): SignalTiming {
  const test = trigger.test;
  return {
    window: trigger.window ?? null,
    atLeast: trigger.window?.of === 'count' && test?.is === 'gte' ? test.to : NO_TIMING.atLeast,
    debounceSeconds: trigger.debounceSeconds ?? 0,
    holdSeconds: trigger.holdSeconds ?? 0,
    cooldownSeconds: trigger.cooldownSeconds ?? 0,
  };
}

function withSeconds(
  trigger: SignalTriggerV2,
  key: 'debounceSeconds' | 'holdSeconds' | 'cooldownSeconds',
  seconds: number,
): SignalTriggerV2 {
  const { [key]: _dropped, ...rest } = trigger;
  return seconds > 0 ? { ...rest, [key]: seconds } : rest;
}

function withWindow(trigger: SignalTriggerV2, timing: SignalTiming): SignalTriggerV2 {
  const { window: _window, ...rest } = trigger;
  if (timing.window === null) return rest;
  const counting = timing.window.of === 'count';
  return {
    ...rest,
    window: timing.window,
    ...(counting ? { test: { is: 'gte', to: timing.atLeast } } : {}),
  };
}

export function withTiming(trigger: SignalTriggerV2, timing: SignalTiming): SignalTriggerV2 {
  const windowed = withWindow(trigger, timing);
  const held = withSeconds(windowed, 'holdSeconds', timing.holdSeconds);
  const settled = withSeconds(held, 'debounceSeconds', timing.debounceSeconds);
  return withSeconds(settled, 'cooldownSeconds', timing.cooldownSeconds);
}
