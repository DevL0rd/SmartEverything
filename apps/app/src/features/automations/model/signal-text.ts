import {
  EVENT_KINDS,
  SIGNAL_SOURCES,
  cameraDetectionOf,
  eventLabel,
  kindSpecOf,
  type JsonValue,
  type SignalTriggerV2,
  type SignalWindowMode,
  type TriggerTestV2,
} from '@smarteverything/domain';
import { withUnit } from '../../../format/number';
import { duration } from '../../../format/time';
import type { SignalTiming } from './signal-triggers';

const WINDOW_WORDS: Readonly<Record<SignalWindowMode, string>> = {
  avg: 'on average',
  min: 'at its lowest',
  max: 'at its highest',
  rate: 'per minute',
  count: 'times',
};

type RankedOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

export const COMPARISON_WORDS: Readonly<Record<RankedOperator, readonly [string, string]>> = {
  eq: ['becomes', 'is'],
  ne: ['stops being', 'is not'],
  gt: ['rises above', 'is above'],
  gte: ['reaches', 'is at least'],
  lt: ['drops below', 'is below'],
  lte: ['falls to', 'is at most'],
};

export function timingText(timing: SignalTiming): string {
  const parts: string[] = [];
  if (timing.window !== null) {
    parts.push(
      timing.window.of === 'count'
        ? `${String(timing.atLeast)} times within ${duration(timing.window.seconds)}`
        : `${WINDOW_WORDS[timing.window.of]} over ${duration(timing.window.seconds)}`,
    );
  }
  if (timing.holdSeconds > 0) {
    parts.push(`for ${duration(timing.holdSeconds)}`);
  }
  if (timing.debounceSeconds > 0) {
    parts.push(`once it settles for ${duration(timing.debounceSeconds)}`);
  }
  if (timing.cooldownSeconds > 0) {
    parts.push(`at most every ${duration(timing.cooldownSeconds)}`);
  }
  return parts.join(', ');
}

export function signalFieldOf(
  trigger: Pick<SignalTriggerV2, 'source' | 'kind' | 'field'>,
): { readonly label: string; readonly unit: string | null } | null {
  const fields = kindSpecOf(SIGNAL_SOURCES, trigger)?.fields;
  if (trigger.field === undefined || fields === undefined || fields === 'capabilities') {
    return null;
  }
  return fields.find((entry) => entry.field === trigger.field) ?? null;
}

function amountText(value: JsonValue, unit: string | null): string {
  return withUnit(typeof value === 'number' ? String(value) : JSON.stringify(value), unit);
}

export function testPhrase(test: TriggerTestV2 | undefined, unit: string | null): string {
  if (test === undefined) return 'happens';
  if (test.is === 'changed') return 'changes';
  if (test.is === 'between')
    return `is between ${amountText(test.min, unit)} and ${amountText(test.max, unit)}`;
  if (test.is === 'in') return `is ${test.to.map((entry) => amountText(entry, unit)).join(' or ')}`;
  return `${COMPARISON_WORDS[test.is][0]} ${amountText(test.to, unit)}`;
}

function pulseText(label: string, field: { readonly label: string } | null, whose: string): string {
  return `${label}${field === null ? '' : ` (${field.label})`}${whose}`;
}

function sourceLabel(source: string): string {
  return SIGNAL_SOURCES.find((spec) => spec.source === source)?.label ?? source;
}

function signalLabel(trigger: SignalTriggerV2): string {
  const eventKind = EVENT_KINDS.find((kind) => kind === trigger.kind);
  return trigger.source === 'event' && eventKind !== undefined
    ? eventLabel(eventKind, trigger.match ?? {})
    : (kindSpecOf(SIGNAL_SOURCES, trigger)?.label ?? trigger.kind);
}

function matchText(trigger: SignalTriggerV2): string {
  const spec = kindSpecOf(SIGNAL_SOURCES, trigger);
  const match = trigger.match ?? {};
  const eventKind = EVENT_KINDS.find((kind) => kind === trigger.kind);
  const detection =
    trigger.source === 'event' && eventKind !== undefined
      ? cameraDetectionOf(eventKind, match)
      : null;
  const parts = Object.entries(match).flatMap(([key, value]) => {
    if (key === 'detection' && detection !== null) {
      return [];
    }
    const entry = spec?.match.find((candidate) => candidate.key === key);
    const text =
      typeof value === 'string' ? (entry?.valueLabels?.[value] ?? value) : JSON.stringify(value);
    return [`${entry?.label ?? key}: ${text}`];
  });
  return parts.length === 0 ? '' : ` matching ${parts.join(', ')}`;
}

export function signalText(trigger: SignalTriggerV2, subjectName: string | null): string {
  const kind = kindSpecOf(SIGNAL_SOURCES, trigger);
  const field = signalFieldOf(trigger);
  const label = signalLabel(trigger);
  const whose = subjectName === null ? '' : ` for ${subjectName}`;
  const matching = matchText(trigger);
  if (kind?.pulse === true) {
    return `${pulseText(label, field, whose)}${matching}`;
  }
  const amount = testPhrase(trigger.test, field?.unit ?? null);
  return `${sourceLabel(trigger.source)}: ${field?.label ?? label}${whose} ${amount}${matching}`;
}
