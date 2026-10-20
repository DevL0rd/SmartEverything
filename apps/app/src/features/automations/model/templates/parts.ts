import type { FlowNode, JsonValue, TriggerNode } from '@smarteverything/domain';
import { SECOND_MS, lit, type Maker, type Ports } from './build';

export type Test = Readonly<Record<string, JsonValue>>;

export function stateSignal(
  m: Maker,
  key: string,
  watch: {
    readonly subject: string;
    readonly field: string;
    readonly test: Test;
    readonly holdSeconds?: number;
    readonly rearm?: number;
  },
): TriggerNode {
  const ports: Ports = {
    source: lit('device'),
    kind: lit('state'),
    subject: lit(watch.subject),
    field: lit(watch.field),
    test: lit({ ...watch.test }),
    ignoreOwnChanges: lit(false),
    ...(watch.holdSeconds === undefined ? {} : { hold: lit(watch.holdSeconds * SECOND_MS) }),
    ...(watch.rearm === undefined ? {} : { rearm: lit(watch.rearm) }),
  };
  return m.trigger(key, 'trigger.signal', ports);
}

export function eventSignal(
  m: Maker,
  key: string,
  event: {
    readonly source: string;
    readonly kind: string;
    readonly subject?: string;
    readonly match?: Test;
  },
): TriggerNode {
  const ports: Ports = {
    source: lit(event.source),
    kind: lit(event.kind),
    ...(event.subject === undefined ? {} : { subject: lit(event.subject) }),
    ...(event.match === undefined ? {} : { match: lit({ ...event.match }) }),
    ignoreOwnChanges: lit(false),
  };
  return m.trigger(key, 'trigger.signal', ports);
}

export function notice(m: Maker, key: string, message: string): FlowNode {
  return m.node(key, 'notify.feed', { message: lit(message) });
}

export interface DeviceChange {
  readonly target: Readonly<Record<string, JsonValue>>;
  readonly control: string;
  readonly to: JsonValue;
}

export function setDevices(m: Maker, key: string, change: DeviceChange): FlowNode {
  return m.node(key, 'device.set', {
    target: lit({ ...change.target }),
    control: lit(change.control),
    to: lit(change.to),
  });
}
