import {
  deviceFamily,
  jsonEquals,
  type DeviceFamily,
  type JsonValue,
  type PlannerCompletion,
  type PlannerCompletionWindow,
} from '@smarteverything/domain';
import type { ReactNode, Ref } from 'react';
import type { View } from 'react-native';
import { ListRow } from '../../../components/list-row';
import { useRow } from '../../../store/selectors';

export type SignalCompletion = Extract<PlannerCompletion, { readonly kind: 'signal' }> & {
  readonly minSeconds?: number;
};

export interface RuleDevice {
  readonly id: string;
  readonly label: string;
  readonly family: DeviceFamily;
}

export const MANUAL: PlannerCompletion = { kind: 'manual' };

export const RULE_MINUTES: Readonly<Partial<Record<DeviceFamily, readonly number[]>>> = {
  treadmill: [10, 20],
  toothbrush: [2],
};

const PERSONAL: ReadonlySet<DeviceFamily> = new Set(['treadmill', 'toothbrush']);

const SESSION_NOUNS: Readonly<Record<string, string>> = {
  walk: 'walk',
  jog: 'jog',
  run: 'run',
};

const BOTTLE_TEXT: Readonly<Record<string, string>> = {
  drink: 'records a drink',
  refill: 'is refilled',
  uv_clean: 'finishes its UV clean',
};

export const WINDOW_TEXT: Readonly<Record<PlannerCompletionWindow, string>> = {
  occurrence: 'in this slot or later today',
  day: 'any time that day',
};

function bottleTextOf(activity: string): string {
  return BOTTLE_TEXT[activity] ?? `reports ${activity.replaceAll('_', ' ')}`;
}

function fact(completion: SignalCompletion, key: string): string | null {
  const value = completion.matcher.match?.[key];
  return typeof value === 'string' ? value : null;
}

function minutesOf(completion: SignalCompletion): string {
  const seconds = completion.minSeconds;
  return seconds === undefined ? '' : ` of ${String(Math.round(seconds / 60))} min or more`;
}

function treadmillNoun(completion: SignalCompletion): string {
  const kind = fact(completion, 'kind');
  return kind === null ? 'treadmill session' : (SESSION_NOUNS[kind] ?? 'treadmill session');
}

type Sentence = (completion: SignalCompletion, label: string) => string;

const SENTENCES: Readonly<Partial<Record<DeviceFamily, Sentence>>> = {
  treadmill: (completion) => `a ${treadmillNoun(completion)}${minutesOf(completion)} ends`,
  toothbrush: (completion) => `brushing${minutesOf(completion)} ends`,
  bottle: (completion, label) =>
    `${label} ${bottleTextOf(fact(completion, 'activity') ?? 'drink')}`,
};

function sentenceOf(completion: SignalCompletion, device: RuleDevice | null): string {
  if (device === null) return `a device that was removed reports ${completion.matcher.kind}`;
  const sentence = SENTENCES[device.family];
  return sentence === undefined
    ? `${device.label} reports ${completion.matcher.kind}`
    : sentence(completion, device.label);
}

export function ruleTitleOf(completion: PlannerCompletion, device: RuleDevice | null): string {
  if (completion.kind === 'manual') return 'I tick it myself';
  return `Done when ${sentenceOf(completion, device)}`;
}

function pluralOf(completion: SignalCompletion, family: DeviceFamily): string {
  return family === 'treadmill' ? `${treadmillNoun(completion)}s` : 'brushing sessions';
}

export function whoseTextOf(
  completion: SignalCompletion,
  device: RuleDevice | null,
  personName: string,
): string | null {
  if (device === null || !PERSONAL.has(device.family)) return null;
  const whose = personName === 'You' ? 'your' : `${personName}’s`;
  return `Only ${whose} ${pluralOf(completion, device.family)}`;
}

export function ruleDetailOf(
  completion: PlannerCompletion,
  device: RuleDevice | null,
  personName: string,
): string {
  if (completion.kind === 'manual') return 'Or let a device check it off';
  const when = WINDOW_TEXT[completion.window];
  const whose = whoseTextOf(completion, device, personName);
  const where = device === null ? '' : ` on the ${device.label}`;
  if (whose !== null) return `${whose}${where}, ${when}`;
  return device === null ? `Counts ${when}` : `${device.label}, ${when}`;
}

export function ruleMinutesOf(device: RuleDevice | null): readonly number[] {
  return device === null ? [] : (RULE_MINUTES[device.family] ?? []);
}

export function withWindow(
  completion: SignalCompletion,
  window: PlannerCompletionWindow,
): SignalCompletion {
  return { ...completion, window };
}

export function withMinutes(
  completion: SignalCompletion,
  minutes: number | null,
): SignalCompletion {
  const base = { kind: completion.kind, matcher: completion.matcher, window: completion.window };
  return minutes === null ? base : { ...base, minSeconds: minutes * 60 };
}

function matchOf(completion: SignalCompletion): JsonValue {
  return completion.matcher.match ?? {};
}

export function sameRule(left: PlannerCompletion, right: PlannerCompletion): boolean {
  if (left.kind === 'manual' || right.kind === 'manual') return left.kind === right.kind;
  return (
    left.matcher.source === right.matcher.source &&
    left.matcher.kind === right.matcher.kind &&
    left.matcher.subject === right.matcher.subject &&
    jsonEquals(matchOf(left), matchOf(right))
  );
}

export function subjectOf(completion: PlannerCompletion): string | null {
  return completion.kind === 'signal' ? (completion.matcher.subject ?? null) : null;
}

export function useRuleDevice(completion: PlannerCompletion): RuleDevice | null {
  const device = useRow('devices', subjectOf(completion));
  if (device === null) return null;
  return { id: device.id, label: device.label, family: deviceFamily(device) };
}

export interface CompletionRuleRowProps {
  readonly completion: PlannerCompletion;
  readonly device: RuleDevice | null;
  readonly personName: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly pressRef?: Ref<View>;
}

export function CompletionRuleRow({
  completion,
  device,
  personName,
  disabled,
  onPress,
  pressRef,
}: CompletionRuleRowProps): ReactNode {
  const signal = completion.kind === 'signal';
  return (
    <ListRow
      wrapTitle
      wrapSubtitle
      title={ruleTitleOf(completion, device)}
      subtitle={ruleDetailOf(completion, device, personName)}
      icon={signal ? 'zap' : 'circleCheck'}
      iconTone={signal ? 'primary' : 'variant'}
      chevron
      disabled={disabled}
      onPress={onPress}
      {...(pressRef === undefined ? {} : { pressRef })}
    />
  );
}
