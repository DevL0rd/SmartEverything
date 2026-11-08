import type { GraphPiece, JsonValue, TriggerNode } from '@smarteverything/domain';
import { SECOND_MS, lit, type Ports } from './build';
import type { GraphMaker } from './graph-kit';

export type Test = Readonly<Record<string, JsonValue>>;

export function stateSignal(
  m: GraphMaker,
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
  m: GraphMaker,
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

export function notice(m: GraphMaker, key: string, message: string): GraphPiece {
  return m.node(key, 'notify.feed', { message: lit(message) });
}

export interface DeviceChange {
  readonly target: Readonly<Record<string, JsonValue>>;
  readonly control: string;
  readonly to: JsonValue;
}

export function setDevices(m: GraphMaker, key: string, change: DeviceChange): GraphPiece {
  return m.node(key, 'device.set', {
    target: lit({ ...change.target }),
    control: lit(change.control),
    to: lit(change.to),
  });
}
