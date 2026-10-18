import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { MiioDeviceError, MiioPacketError } from './errors';
import type { PropertyReading } from './miot';
import { LEGACY_BUTTON_METHOD, type LegacyButtonMethod } from './events';
import type { PushOffer } from './miio-packet';

export const SUBSCRIBE_METHOD = 'miIO.sub';
export const UNSUBSCRIBE_METHOD = 'miIO.unsub';

const SUBSCRIPTION_VERSION = '2.0';
const WILDCARD_METHOD = '.';
const RESUBSCRIBE_STATES: ReadonlySet<number> = new Set([0, 1, 4]);
const ID = z.number().int();

const PROPERTY_CHANGE = z.object({
  did: z.string(),
  siid: z.number().int(),
  piid: z.number().int(),
  value: JSON_VALUE,
});

const EVENT_ARGUMENT = z.object({ piid: z.number().int(), value: JSON_VALUE });

const UPLINK = z.discriminatedUnion('method', [
  z.object({
    id: ID,
    method: z.literal('properties_changed'),
    params: z.array(PROPERTY_CHANGE).max(256),
  }),
  z.object({
    id: ID,
    method: z.literal('event_occured'),
    params: z.object({
      did: z.string(),
      siid: z.number().int(),
      eiid: z.number().int(),
      arguments: z.array(EVENT_ARGUMENT).max(64).default([]),
    }),
  }),
]);

const CHILD_EVENT = z.object({
  id: ID,
  method: LEGACY_BUTTON_METHOD,
  params: z.array(z.unknown()),
  sid: z.string().min(1),
  model: z.string().min(1),
});

const METHOD_CALL = z.object({ id: ID, method: z.string() });

const STATUS_NOTICE = z.object({
  id: ID,
  method: z.enum(['event.gw.heartbeat', 'event.keepalive', 'props']),
});

const SUBSCRIBE_RESULT = z.object({ code: z.number().int() });

export interface MiotEventArgument {
  readonly piid: number;
  readonly value: JsonValue;
}

export interface LegacyChildEvent {
  readonly kind: 'child-event';
  readonly id: number;
  readonly childDid: string;
  readonly model: string;
  readonly method: LegacyButtonMethod;
}

export type Uplink =
  | LegacyChildEvent
  | { readonly kind: 'properties'; readonly id: number; readonly readings: PropertyReading[] }
  | {
      readonly kind: 'event';
      readonly id: number;
      readonly siid: number;
      readonly eiid: number;
      readonly arguments: readonly MiotEventArgument[];
    };

export function subscriptionParams(virtualDid: bigint, subscribedAt: number): JsonValue {
  return {
    version: SUBSCRIPTION_VERSION,
    did: virtualDid.toString(),
    update_ts: subscribedAt,
    sub_method: WILDCARD_METHOD,
  };
}

export function checkSubscription(method: string, result: JsonValue): void {
  const parsed = SUBSCRIBE_RESULT.safeParse(result);
  if (!parsed.success) {
    throw new MiioPacketError(`a ${method} result with a code`, JSON.stringify(result));
  }
  if (parsed.data.code !== 0) {
    throw new MiioDeviceError(method, parsed.data.code, 'the subscription was not accepted');
  }
}

export function needsSubscription(offer: PushOffer, subscribedAt: number | null): boolean {
  return RESUBSCRIBE_STATES.has(offer.state) && offer.subscribedAt !== subscribedAt;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new MiioPacketError('a JSON body', `${text} (${String(cause)})`);
  }
}

export function isUplink(text: string): boolean {
  return METHOD_CALL.safeParse(parseJson(text)).success;
}

export function statusNoticeId(text: string): number | null {
  const notice = STATUS_NOTICE.safeParse(parseJson(text));
  return notice.success ? notice.data.id : null;
}

function checkDevice(expected: string, received: string): void {
  if (received !== expected) {
    throw new MiioPacketError(`an uplink about device ${expected}`, `device ${received}`);
  }
}

export function parseUplink(did: string, text: string): Uplink {
  const body = parseJson(text);
  const child = CHILD_EVENT.safeParse(body);
  if (child.success) {
    return {
      kind: 'child-event',
      id: child.data.id,
      childDid: child.data.sid,
      model: child.data.model,
      method: child.data.method,
    };
  }
  const parsed = UPLINK.safeParse(body);
  if (!parsed.success) {
    throw new MiioPacketError('a supported MIoT uplink or legacy child button event', text);
  }
  const message = parsed.data;
  if (message.method === 'event_occured') {
    checkDevice(did, message.params.did);
    const { siid, eiid } = message.params;
    return { kind: 'event', id: message.id, siid, eiid, arguments: message.params.arguments };
  }
  for (const change of message.params) {
    checkDevice(did, change.did);
  }
  const readings = message.params.map(({ siid, piid, value }): PropertyReading => ({
    siid,
    piid,
    ok: true,
    value,
  }));
  return { kind: 'properties', id: message.id, readings };
}

export function uplinkAck(id: number): string {
  return JSON.stringify({ id, result: { code: 0 } });
}
