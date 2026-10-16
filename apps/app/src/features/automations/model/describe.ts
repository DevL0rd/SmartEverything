import {
  EVENT_KIND_LABELS,
  SIGNAL_SOURCES,
  kindSpecOf,
  type Action,
  type LegacyAction,
  type StructuredAction,
  type AutomationValueRow,
  type LegacyCondition,
  type AutomationDefinition,
  type Comparison,
  type Condition,
  type SignalSubject,
  type SignalTrigger,
  type Trigger,
} from '@smarteverything/domain';
import { typedConditionPhrase, programActionPhrase } from './program-description';
import type { DeviceLike } from './capability-choices';
import { subjectLabel, subjectOf, subjectValue, type Subject } from './present';
import { duration } from '../../../format/time';
import { offsetText, sentenceStart, weekdaysText } from './time-text';
import { daylightText, weatherKindText, weatherRuleText } from './weather-text';
import { COMPARISON_WORDS, signalText, timingText } from './signal-text';
import { baseOf, timingOf } from './signal-triggers';

interface Named {
  readonly id: string;
  readonly name: string;
}

export interface Names {
  readonly devices: readonly DeviceLike[];
  readonly values?: readonly AutomationValueRow[];
  readonly sequences?: readonly Named[];
  readonly automations?: readonly Named[];
  readonly groups?: readonly Named[];
  readonly rooms?: readonly Named[];
  readonly scenes: readonly Named[];
  readonly people: readonly Named[];
  readonly chats: readonly { readonly id: string; readonly title: string }[];
}

export interface Summary {
  readonly when: readonly string[];
  readonly conditions: readonly string[];
  readonly mode: 'all' | 'any';
  readonly then: readonly string[];
}

const GONE = 'a removed device';

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

function deviceName(names: Names, deviceId: string): string {
  return names.devices.find((device) => device.id === deviceId)?.label ?? GONE;
}

function comparisonText(subject: Subject, comparison: Comparison, moving: boolean): string {
  const label = subjectLabel(subject);
  if (comparison.operator === 'changed') {
    return `${label} changes`;
  }
  if (comparison.operator === 'between') {
    return `${label} is between ${subjectValue(subject, comparison.min)} and ${subjectValue(subject, comparison.max)}`;
  }
  const [change, standing] = COMPARISON_WORDS[comparison.operator];
  return `${label} ${moving ? change : standing} ${subjectValue(subject, comparison.value)}`;
}

function booleanPhrase(subject: Subject, comparison: Comparison): string | null {
  const verbs = BECOMES_TRUE[subject.key];
  if (
    verbs === undefined ||
    comparison.operator !== 'eq' ||
    typeof comparison.value !== 'boolean'
  ) {
    return null;
  }
  return comparison.value ? verbs[0] : verbs[1];
}

function statePhrase(names: Names, trigger: Extract<Trigger, { type: 'state' }>): string {
  const subject = subjectOf(names.devices, trigger.deviceId, trigger.capability);
  const verb = booleanPhrase(subject, trigger.comparison);
  return `${subject.device?.label ?? GONE} ${verb ?? comparisonText(subject, trigger.comparison, true)}`;
}

function eventPhrase(names: Names, trigger: Extract<Trigger, { type: 'event' }>): string {
  const from = trigger.deviceId === null ? 'any device' : deviceName(names, trigger.deviceId);
  return `${from} reports “${EVENT_KIND_LABELS[trigger.kind]}”`;
}

const SUBJECT_NAMES: Readonly<
  Record<SignalSubject, ((names: Names, id: string) => string) | null>
> = {
  device: deviceName,
  camera: deviceName,
  profile: (names, id) =>
    names.people.find((person) => person.id === id)?.name ?? 'someone removed',
  chat: (names, id) => names.chats.find((chat) => chat.id === id)?.title ?? 'a chat',
  client: null,
  channel: null,
  automation: null,
  automation_value: null,
  schedule: null,
  planner_item: null,
  none: null,
};

function signalSubjectName(names: Names, trigger: SignalTrigger): string | null {
  const subject = kindSpecOf(SIGNAL_SOURCES, trigger)?.subject;
  return trigger.subject === null || subject === undefined
    ? null
    : (SUBJECT_NAMES[subject]?.(names, trigger.subject) ?? null);
}

export function describeTrigger(names: Names, trigger: Trigger): string {
  if (trigger.type !== 'signal') {
    return untimedPhrase(names, trigger);
  }
  const base = baseOf(trigger);
  const timing = timingText(timingOf(trigger));
  const what =
    base === null || Object.keys(trigger.match).length > 0
      ? signalText(trigger, signalSubjectName(names, trigger))
      : untimedPhrase(names, base);
  return timing === '' ? what : `${what}, ${timing}`;
}

function untimedPhrase(names: Names, trigger: Exclude<Trigger, { type: 'signal' }>): string {
  switch (trigger.type) {
    case 'speech':
      return `speech contains “${trigger.phrase}”`;
    case 'state':
      return statePhrase(names, trigger);
    case 'event':
      return eventPhrase(names, trigger);
    case 'time':
      return `${weekdaysText(trigger.weekdays)} at ${trigger.at}`;
    case 'sun':
      return offsetText(trigger.event, trigger.offsetMinutes);
    case 'interval':
      return `every ${duration(trigger.everyMinutes * 60)}`;
    case 'weather':
      return weatherRuleText(trigger.metric, trigger.comparison, true);
    case 'weather_kind':
      return weatherKindText(trigger.kinds, true);
  }
}

function whenPhrase(names: Names, trigger: Trigger): string {
  const text = describeTrigger(names, trigger);
  return trigger.type === 'time' || trigger.type === 'sun' || trigger.type === 'interval'
    ? text
    : `when ${text}`;
}

export function describeCondition(names: Names, condition: Condition): string {
  return condition.type === 'binding' || condition.type === 'value'
    ? typedConditionPhrase(names, condition)
    : legacyConditionPhrase(names, condition);
}
function legacyConditionPhrase(names: Names, condition: LegacyCondition): string {
  switch (condition.type) {
    case 'state': {
      const subject = subjectOf(names.devices, condition.deviceId, condition.capability);
      return `${subject.device?.label ?? GONE} ${comparisonText(subject, condition.comparison, false)}`;
    }
    case 'time_window':
      return `it is between ${condition.after} and ${condition.before}`;
    case 'weekday':
      return `it is ${weekdaysText(condition.weekdays).replace(/^every day$/, 'any day')}`;
    case 'weather':
      return weatherRuleText(condition.metric, condition.comparison, false);
    case 'weather_kind':
      return weatherKindText(condition.kinds, false);
    case 'daylight':
      return daylightText(condition);
  }
}

function commandPhrase(names: Names, action: Extract<LegacyAction, { type: 'command' }>): string {
  const subject = subjectOf(names.devices, action.deviceId, action.capability);
  const device = subject.device?.label ?? GONE;
  if (action.capability === 'power' && typeof action.value === 'boolean') {
    return `turn ${action.value ? 'on' : 'off'} ${device}`;
  }
  if (subject.capability?.value.kind === 'action') {
    return `${subjectLabel(subject)} on ${device}`;
  }
  return `set ${device} ${subjectLabel(subject)} to ${subjectValue(subject, action.value)}`;
}

function wakePhrase(names: Names, action: Extract<Action, { type: 'wake_ai' }>): string {
  const chat =
    action.chatId === null
      ? 'a new chat'
      : `“${names.chats.find((row) => row.id === action.chatId)?.title ?? 'a chat'}”`;
  const person = names.people.find((row) => row.id === action.profileId)?.name ?? 'someone removed';
  return `wake ${person}’s AI in ${chat}`;
}

export function toolLabel(tool: string): string {
  return tool.replaceAll('_', ' ');
}

export function describeAction(names: Names, action: Action): string {
  if (action.type === 'command' && 'binding' in action)
    return `set ${deviceName(names, action.deviceId)} ${action.capability} from a typed input`;
  if (isStructuredDescription(action)) return programActionPhrase(names, action);
  return legacyActionPhrase(names, action);
}
function legacyActionPhrase(names: Names, action: LegacyAction): string {
  switch (action.type) {
    case 'command':
      return commandPhrase(names, action);
    case 'scene':
      return `run ${names.scenes.find((scene) => scene.id === action.sceneId)?.name ?? 'a deleted scene'}`;
    case 'delay':
      return `wait ${duration(action.seconds)}`;
    case 'notify':
      return action.message.trim() === '' ? 'send a notice' : `send “${action.message.trim()}”`;
    case 'wake_ai':
      return wakePhrase(names, action);
    case 'tool':
      return `use the tool “${toolLabel(action.tool)}”`;
  }
}

export function summarize(names: Names, definition: Omit<AutomationDefinition, 'origin'>): Summary {
  return {
    when: definition.triggers.map((trigger) => whenPhrase(names, trigger)),
    conditions: definition.conditions.items.map((condition) => describeCondition(names, condition)),
    mode: definition.conditions.mode,
    then: definition.actions.map((action) => describeAction(names, action)),
  };
}

export function sentenceOf(summary: Summary): string | null {
  if (summary.when.length === 0 || summary.then.length === 0) {
    return null;
  }
  const only =
    summary.conditions.length === 0
      ? ''
      : `, if ${summary.conditions.join(summary.mode === 'all' ? ' and ' : ' or ')}`;
  return sentenceStart(`${summary.when.join(' or ')}${only}, ${summary.then.join(', then ')}.`);
}

function isStructuredDescription(
  action: Action,
): action is Exclude<StructuredAction, { type: 'command' }> {
  return (
    action.type === 'temporary_effect' ||
    action.type === 'target_command' ||
    action.type === 'choose' ||
    action.type === 'repeat' ||
    action.type === 'sequence' ||
    action.type === 'value_update' ||
    action.type === 'stop'
  );
}
