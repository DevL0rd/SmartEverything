import { z } from 'zod';
import { testHolds } from './automation-v2-eval';
import {
  walkSteps,
  type AutomationV2,
  type ConditionV2,
  type InputDeclarationV2,
  type StepV2,
  type TriggerTestV2,
  type TriggerV2,
} from './automation-v2-schema';
import { jsonEquals } from './comparison';
import {
  signalTriggerError,
  type SignalSourceSpec,
  type SignalTriggerError,
} from './signal-sources/index';
import type { SignalInput } from './signals';
import type { SpeechTrigger } from './speech-triggers';
import type { JsonValue } from './values';

export type SignalTriggerV2 = Extract<TriggerV2, { on: 'signal' }>;
export type SpeechTriggerV2 = Extract<TriggerV2, { on: 'speech' }>;

export function signalMatchesV2(trigger: SignalTriggerV2, signal: SignalInput): boolean {
  return (
    trigger.source === signal.source &&
    trigger.kind === signal.kind &&
    (trigger.subject === undefined || trigger.subject === signal.subject) &&
    (trigger.field === undefined || trigger.field === signal.field) &&
    Object.entries(trigger.match ?? {}).every(([key, value]) => {
      const actual = signal.data[key];
      return actual !== undefined && jsonEquals(actual, value);
    })
  );
}

export function triggerTestHolds(
  test: TriggerTestV2 | undefined,
  value: JsonValue,
  previous: JsonValue | undefined,
): boolean {
  if (test === undefined) return true;
  if (test.is === 'changed') return previous !== undefined && !jsonEquals(value, previous);
  return testHolds(test, value);
}

export function speechTriggerOf(trigger: SpeechTriggerV2): SpeechTrigger {
  const { source } = trigger;
  const mapped = (): SpeechTrigger['source'] => {
    if (source === undefined) return null;
    if ('camera' in source) return { kind: 'camera', deviceId: source.camera };
    if ('phone' in source) return { kind: 'phone', deviceId: source.phone };
    if ('computer' in source) return { kind: 'computer', deviceId: source.computer };
    if ('chat' in source) return { kind: 'attachment', chatId: source.chat };
    return { kind: 'plugin', pluginId: source.plugin, sourceId: source.sourceId };
  };
  return {
    type: 'speech',
    phrase: trigger.phrase,
    caseSensitive: trigger.caseSensitive ?? false,
    includeBots: trigger.includeBots ?? false,
    source: mapped(),
  };
}

export function automationSignalErrorV2(
  sources: readonly SignalSourceSpec[],
  automation: Pick<AutomationV2, 'when'>,
): SignalTriggerError | null {
  for (const trigger of automation.when) {
    const error =
      trigger.on === 'signal'
        ? signalTriggerError(sources, {
            source: trigger.source,
            kind: trigger.kind,
            match: trigger.match ?? {},
          })
        : null;
    if (error !== null) return error;
  }
  return null;
}

export function automationUsesAi(steps: readonly StepV2[]): boolean {
  return walkSteps(steps).some((step) => step.do === 'ai' || step.do === 'tool');
}

export function conditionClockMinutes(condition: ConditionV2): readonly number[] {
  if ('all' in condition) return condition.all.flatMap(conditionClockMinutes);
  if ('any' in condition) return condition.any.flatMap(conditionClockMinutes);
  if ('not' in condition) return conditionClockMinutes(condition.not);
  if (!('time' in condition)) return [];
  const { after, before, days } = condition.time;
  return [
    ...(days === undefined ? [] : [0]),
    ...[after, before].flatMap((clock) =>
      clock === undefined ? [] : [Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3))],
    ),
  ];
}

const INPUT_TYPE: Readonly<Record<InputDeclarationV2['type'], z.ZodType>> = {
  flag: z.boolean(),
  number: z.number(),
  duration: z.number().nonnegative(),
  choice: z.uuid(),
  text: z.string(),
};

export function runInputError(
  declared: readonly InputDeclarationV2[] | undefined,
  inputs: Readonly<Record<string, JsonValue>>,
): string | null {
  const names = new Set((declared ?? []).map((input) => input.name));
  const unknown = Object.keys(inputs).find((name) => !names.has(name));
  if (unknown !== undefined) return `The automation has no input ${unknown}.`;
  for (const { name, type } of declared ?? []) {
    const value = inputs[name];
    if (value === undefined) return `Missing input ${name}.`;
    if (!INPUT_TYPE[type].safeParse(value).success) return `Input ${name} must be a ${type}.`;
  }
  return null;
}
