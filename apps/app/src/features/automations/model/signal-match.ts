import {
  JSON_VALUE,
  SIGNAL_TRIGGER,
  type JsonValue,
  type SignalTrigger,
  type Trigger,
} from '@smarteverything/domain';
import { withTiming, type SignalTiming, type TimedBase } from './signal-triggers';

export function changedMatch(
  match: SignalTrigger['match'],
  key: string,
  value: JsonValue | undefined,
): SignalTrigger['match'] {
  const kept = Object.fromEntries(Object.entries(match).filter(([name]) => name !== key));
  return value === undefined ? kept : { ...kept, [key]: value };
}

export function matchValue(text: string): JsonValue {
  try {
    const parsed = JSON_VALUE.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : text;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return text;
    }
    throw error;
  }
}

export function withEventMatch(
  base: Extract<TimedBase, { type: 'event' }>,
  timing: SignalTiming,
  original: Trigger,
  match: SignalTrigger['match'],
): Trigger {
  const current = withTiming(base, timing, original);
  if (current.type === 'signal') {
    return { ...current, match };
  }
  return Object.keys(match).length === 0
    ? current
    : SIGNAL_TRIGGER.parse({
        type: 'signal',
        source: 'event',
        kind: base.kind,
        subject: base.deviceId,
        match,
      });
}
