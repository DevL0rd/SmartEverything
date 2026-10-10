import {
  CAPABILITY_KEY,
  EVENT_KINDS,
  WEATHER_FORECAST,
  eventTriggerFires,
  stateTriggerFires,
  weatherChangeFires,
  type SignalInput,
  type Trigger,
} from '@smarteverything/domain';
import { z } from 'zod';

const EVENT_KIND = z.enum(EVENT_KINDS);

function stateFires(trigger: Trigger, signal: SignalInput): boolean {
  const capability = CAPABILITY_KEY.safeParse(signal.field);
  return (
    signal.subject !== null &&
    capability.success &&
    stateTriggerFires(trigger, {
      deviceId: signal.subject,
      capability: capability.data,
      value: signal.value,
      previous: signal.previous ?? undefined,
    })
  );
}

function eventFires(trigger: Trigger, signal: SignalInput): boolean {
  const kind = EVENT_KIND.safeParse(signal.kind);
  return kind.success && eventTriggerFires(trigger, { deviceId: signal.subject, kind: kind.data });
}

function weatherFires(trigger: Trigger, signal: SignalInput): boolean {
  const next = WEATHER_FORECAST.safeParse(signal.value);
  const previous = WEATHER_FORECAST.safeParse(signal.previous);
  return (
    next.success &&
    weatherChangeFires(trigger, previous.success ? previous.data : null, next.data)
  );
}

export function legacyTriggerFires(trigger: Trigger, signal: SignalInput): boolean {
  switch (signal.source) {
    case 'device':
      return signal.kind === 'state' && stateFires(trigger, signal);
    case 'event':
      return eventFires(trigger, signal);
    case 'weather':
      return weatherFires(trigger, signal);
    default:
      return false;
  }
}
