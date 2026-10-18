import type { Condition, Conditions } from './automation-conditions';
import type { Trigger } from './automations';
import { compareSubjectOf, idOf, testOf, triggerTestOf } from './automation-v2-convert-input';
import type { ConditionV2, SpeechSourceV2, TriggerV2 } from './automation-v2-schema';
import type { SignalTrigger } from './signals';
import type { SpeechTrigger } from './speech-triggers';

type SignalV2 = Extract<TriggerV2, { on: 'signal' }>;

function selectorOf(trigger: SignalTrigger): Pick<SignalV2, 'subject' | 'field' | 'match'> {
  return {
    ...(trigger.subject === null ? {} : { subject: trigger.subject }),
    ...(trigger.field === null ? {} : { field: trigger.field }),
    ...(Object.keys(trigger.match).length === 0 ? {} : { match: trigger.match }),
  };
}

function timingOf(
  trigger: SignalTrigger,
): Pick<SignalV2, 'window' | 'holdSeconds' | 'debounceSeconds' | 'cooldownSeconds'> {
  return {
    ...(trigger.window === null
      ? {}
      : { window: { of: trigger.window.mode, seconds: trigger.window.seconds } }),
    ...(trigger.holdSeconds === 0 ? {} : { holdSeconds: trigger.holdSeconds }),
    ...(trigger.debounceSeconds === 0 ? {} : { debounceSeconds: trigger.debounceSeconds }),
    ...(trigger.cooldownSeconds === 0 ? {} : { cooldownSeconds: trigger.cooldownSeconds }),
  };
}

function signalV2Of(trigger: SignalTrigger, id: { readonly id?: string }): TriggerV2 {
  return {
    on: 'signal',
    ...id,
    source: trigger.source,
    kind: trigger.kind,
    ...selectorOf(trigger),
    ...(trigger.comparison === null ? {} : { test: triggerTestOf(trigger.comparison) }),
    ...timingOf(trigger),
  };
}

function speechV2Of(trigger: SpeechTrigger, id: { readonly id?: string }): TriggerV2 {
  const source = trigger.source;
  return {
    on: 'speech',
    ...id,
    phrase: trigger.phrase,
    ...(trigger.caseSensitive ? { caseSensitive: true } : {}),
    ...(trigger.includeBots ? { includeBots: true } : {}),
    ...(source === null ? {} : { source: speechSourceV2Of(source) }),
  };
}

function speechSourceV2Of(source: NonNullable<SpeechTrigger['source']>): SpeechSourceV2 {
  switch (source.kind) {
    case 'camera':
      return { camera: source.deviceId };
    case 'phone':
      return { phone: source.deviceId };
    case 'computer':
      return { computer: source.deviceId };
    case 'plugin':
      return { plugin: source.pluginId, sourceId: source.sourceId };
    case 'attachment':
      return { chat: source.chatId };
  }
}

function weatherV2Of(
  field: string,
  test: Extract<ConditionV2, { test: unknown }>['test'],
  id: { readonly id?: string },
): TriggerV2 {
  return { on: 'signal', ...id, source: 'weather', kind: 'forecast', field, test };
}

type TimedV1 = Extract<Trigger, { type: 'time' | 'sun' | 'interval' }>;
type WatchedV1 = Extract<Trigger, { type: 'state' | 'event' | 'weather' | 'weather_kind' }>;

function timedV2Of(trigger: TimedV1, id: { readonly id?: string }): TriggerV2 {
  switch (trigger.type) {
    case 'time':
      return {
        on: 'time',
        ...id,
        at: trigger.at,
        ...(trigger.weekdays.length === 7 ? {} : { days: trigger.weekdays }),
      };
    case 'sun':
      return {
        on: 'sun',
        ...id,
        event: trigger.event,
        ...(trigger.offsetMinutes === 0 ? {} : { offsetMinutes: trigger.offsetMinutes }),
      };
    case 'interval':
      return { on: 'every', ...id, minutes: trigger.everyMinutes };
  }
}

function watchedV2Of(trigger: WatchedV1, id: { readonly id?: string }): TriggerV2 {
  switch (trigger.type) {
    case 'state':
      return {
        on: 'signal',
        ...id,
        source: 'device',
        kind: 'state',
        subject: trigger.deviceId,
        field: trigger.capability,
        test: triggerTestOf(trigger.comparison),
      };
    case 'event':
      return {
        on: 'signal',
        ...id,
        source: 'event',
        kind: trigger.kind,
        ...(trigger.deviceId === null ? {} : { subject: trigger.deviceId }),
      };
    case 'weather':
      return weatherV2Of(trigger.metric, testOf(trigger.comparison), id);
    case 'weather_kind':
      return weatherV2Of('kind', { is: 'in', to: trigger.kinds }, id);
  }
}

export function triggerV2Of(trigger: Trigger): TriggerV2 {
  const id = idOf(trigger);
  if (trigger.type === 'time' || trigger.type === 'sun' || trigger.type === 'interval')
    return timedV2Of(trigger, id);
  if (trigger.type === 'signal') return signalV2Of(trigger, id);
  return trigger.type === 'speech' ? speechV2Of(trigger, id) : watchedV2Of(trigger, id);
}

function daylightV2Of(condition: Extract<Condition, { type: 'daylight' }>): ConditionV2 {
  return {
    daylight: condition.is,
    ...(condition.sunriseOffsetMinutes === 0
      ? {}
      : { sunriseOffset: condition.sunriseOffsetMinutes }),
    ...(condition.sunsetOffsetMinutes === 0 ? {} : { sunsetOffset: condition.sunsetOffsetMinutes }),
  };
}

function conditionV2Of(condition: Condition): ConditionV2 {
  switch (condition.type) {
    case 'state':
      return {
        compare: { device: condition.deviceId, control: condition.capability },
        test: testOf(condition.comparison),
      };
    case 'time_window':
      return { time: { after: condition.after, before: condition.before } };
    case 'weekday':
      return { time: { days: condition.weekdays } };
    case 'weather':
      return { compare: { weather: condition.metric }, test: testOf(condition.comparison) };
    case 'weather_kind':
      return { compare: { weather: 'kind' }, test: { is: 'in', to: condition.kinds } };
    case 'daylight':
      return daylightV2Of(condition);
    case 'value':
      return { compare: { value: condition.valueId }, test: testOf(condition.comparison) };
    case 'binding':
      return { compare: compareSubjectOf(condition.input), test: testOf(condition.comparison) };
  }
}

export function conditionsV2Of(conditions: Conditions): ConditionV2 {
  const items = conditions.items.map(conditionV2Of);
  return conditions.mode === 'all' ? { all: items } : { any: items };
}
