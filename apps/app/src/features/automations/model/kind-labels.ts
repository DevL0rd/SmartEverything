import type { ConditionV2, TriggerV2 } from '@smarteverything/domain';
import type { ConditionKind, StepKind, TriggerKind } from './blanks';
import { formOf } from './signal-triggers';

export const TRIGGER_LABELS: Readonly<Record<TriggerKind, string>> = {
  time: 'Time',
  sun: 'Sunrise or sunset',
  every: 'Every',
  device: 'Device changes',
  event: 'Event',
  weather: 'Weather turns',
  signal: 'Something happens',
  speech: 'Speech contains',
};

export type CardKind = ConditionKind | 'all' | 'not';

export const CONDITION_LABELS: Readonly<Record<CardKind, string>> = {
  compare: 'Compare',
  time: 'Time',
  daylight: 'Day or night',
  any: 'Any of',
  all: 'All of',
  not: 'Not',
};

export const STEP_LABELS: Readonly<Record<StepKind, string>> = {
  set: 'Control',
  audio: 'Change a computer’s sound',
  display: 'Change a computer’s screens',
  scene: 'Run a scene',
  wait: 'Wait',
  notify: 'Send a notice',
  ai: 'Wake the AI',
  tool: 'Use a tool',
  speak: 'Say out loud',
  value: 'Change a Value',
  if: 'If',
  repeat: 'Repeat',
  run: 'Run another automation',
  stop: 'Stop',
};

export const RUN_PROGRAM_LABEL = 'Run a program';

export function triggerKindOf(trigger: TriggerV2): TriggerKind {
  if (trigger.on === 'signal') {
    const form = formOf(trigger);
    return form === 'generic' ? 'signal' : form;
  }
  return trigger.on;
}

export function conditionKindOf(condition: ConditionV2): CardKind {
  if ('compare' in condition) return 'compare';
  if ('time' in condition) return 'time';
  if ('daylight' in condition) return 'daylight';
  if ('any' in condition) return 'any';
  return 'all' in condition ? 'all' : 'not';
}
