import {
  EVENT_KINDS,
  LAUNDRY_EVENT_FAMILY,
  SIGNAL_SOURCES,
  WEATHER_METRICS,
  eventLabel,
  kindSpecOf,
  presentDevice,
  type AutomationV2,
  type SignalSubject,
  type SignalTriggerV2,
  type TriggerTestV2,
  type TriggerV2,
} from '@smarteverything/domain';
import { z } from 'zod';
import { duration } from '../../../format/time';
import { comparisonText, describeCondition, isNumericTest, isRanked } from './describe-conditions';
import { deviceName, personName, type Names } from './describe-names';
import { describeSteps } from './describe-steps';
import { subjectOf, type Subject } from './present';
import { signalText, timingText } from './signal-text';
import { formOf, isWeatherKindSignal, timingOf } from './signal-triggers';
import { offsetText, sentenceStart, weekdaysText } from './time-text';
import { weatherKindText, weatherKindsOf, weatherRuleText } from './weather-text';

export type { Names } from './describe-names';
export { describeCondition } from './describe-conditions';

export interface Summary {
  readonly when: readonly string[];
  readonly only: string | null;
  readonly then: readonly string[];
}

const WEATHER_METRIC = z.enum(WEATHER_METRICS);

const BECOMES_TRUE: Readonly<Record<string, readonly [string, string]>> = {
  power: ['turns on', 'turns off'],
  contact: ['opens', 'closes'],
  lock: ['locks', 'unlocks'],
  motion: ['detects motion', 'stops detecting motion'],
  occupancy: ['becomes occupied', 'becomes empty'],
  leak: ['detects a leak', 'is dry again'],
  smoke: ['detects smoke', 'clears of smoke'],
  gas: ['detects gas', 'clears of gas'],
};

function booleanPhrase(subject: Subject, test: TriggerTestV2): string | null {
  const verbs = BECOMES_TRUE[subject.key];
  if (verbs === undefined || test.is !== 'eq' || typeof test.to !== 'boolean') return null;
  return test.to ? verbs[0] : verbs[1];
}

function statePhrase(names: Names, trigger: SignalTriggerV2): string | null {
  const { subject: deviceId, field, test } = trigger;
  if (deviceId === undefined || field === undefined || test === undefined) return null;
  const subject = subjectOf(names.devices, deviceId, field);
  const verb = isRanked(test) || test.is === 'changed' ? booleanPhrase(subject, test) : null;
  return `${subject.device?.label ?? 'a removed device'} ${verb ?? comparisonText(subject, test, true)}`;
}

function eventPhrase(names: Names, trigger: SignalTriggerV2): string | null {
  const kind = EVENT_KINDS.find((candidate) => candidate === trigger.kind);
  const subject = names.devices.find((device) => device.id === trigger.subject);
  const laundry = subject !== undefined && presentDevice(subject).family === 'laundry';
  const outcomeOnly = Object.keys(trigger.match ?? {}).every((key) => key === 'outcome');
  if (kind === undefined || !outcomeOnly || (trigger.match !== undefined && !laundry)) return null;
  const from = trigger.subject === undefined ? 'any device' : deviceName(names, trigger.subject);
  const details = laundry ? { ...trigger.match, family: LAUNDRY_EVENT_FAMILY } : {};
  return `${from} reports “${eventLabel(kind, details)}”`;
}

function weatherPhrase(trigger: SignalTriggerV2): string | null {
  const { field, test } = trigger;
  if (isWeatherKindSignal(trigger))
    return test?.is === 'in' ? weatherKindText(weatherKindsOf(test.to), true) : null;
  const metric = WEATHER_METRIC.safeParse(field);
  return metric.success && isNumericTest(test) ? weatherRuleText(metric.data, test, true) : null;
}

const SUBJECT_NAMES: Readonly<
  Record<SignalSubject, ((names: Names, id: string) => string) | null>
> = {
  device: deviceName,
  camera: deviceName,
  profile: personName,
  chat: (names, id) => names.chats.find((chat) => chat.id === id)?.title ?? 'a chat',
  client: null,
  channel: null,
  automation: null,
  automation_value: null,
  schedule: null,
  planner_item: null,
  none: null,
};

function signalSubjectName(names: Names, trigger: SignalTriggerV2): string | null {
  const subject = kindSpecOf(SIGNAL_SOURCES, trigger)?.subject;
  return trigger.subject === undefined || subject === undefined
    ? null
    : (SUBJECT_NAMES[subject]?.(names, trigger.subject) ?? null);
}

function signalPhrase(names: Names, trigger: SignalTriggerV2): string {
  const form = formOf(trigger);
  const known =
    form === 'device'
      ? statePhrase(names, trigger)
      : form === 'event'
        ? eventPhrase(names, trigger)
        : form === 'weather'
          ? weatherPhrase(trigger)
          : null;
  const what = known ?? signalText(trigger, signalSubjectName(names, trigger));
  const timing = timingText(timingOf(trigger));
  return timing === '' ? what : `${what}, ${timing}`;
}

export function describeTrigger(names: Names, trigger: TriggerV2): string {
  switch (trigger.on) {
    case 'speech':
      return `speech contains “${trigger.phrase}”`;
    case 'time':
      return `${weekdaysText(trigger.days ?? [0, 1, 2, 3, 4, 5, 6])} at ${trigger.at}`;
    case 'sun':
      return offsetText(trigger.event, trigger.offsetMinutes ?? 0);
    case 'every':
      return `every ${duration(trigger.minutes * 60)}`;
    case 'signal':
      return signalPhrase(names, trigger);
  }
}

function whenPhrase(names: Names, trigger: TriggerV2): string {
  const text = describeTrigger(names, trigger);
  return trigger.on === 'time' || trigger.on === 'sun' || trigger.on === 'every'
    ? text
    : `when ${text}`;
}

export function summarize(
  names: Names,
  automation: Pick<AutomationV2, 'when' | 'onlyIf' | 'steps'>,
): Summary {
  return {
    when: automation.when.map((trigger) => whenPhrase(names, trigger)),
    only: automation.onlyIf === undefined ? null : describeCondition(names, automation.onlyIf),
    then: describeSteps(names, automation.steps),
  };
}

export function sentenceOf(summary: Summary): string | null {
  if (summary.when.length === 0 || summary.then.length === 0) {
    return null;
  }
  const only = summary.only === null || summary.only === '' ? '' : `, if ${summary.only}`;
  return sentenceStart(`${summary.when.join(' or ')}${only}, ${summary.then.join(', then ')}.`);
}
