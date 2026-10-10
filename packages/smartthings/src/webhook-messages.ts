import { JSON_VALUE } from '@smarteverything/domain';
import { z } from 'zod';
import { parsed, SmartThingsResponseError } from './errors';

const ID = z.string().min(1);

const MOMENT = z
  .string()
  .refine((text) => !Number.isNaN(Date.parse(text)), { message: 'not a date and time' });

const DEVICE_EVENT_BODY = z.object({
  deviceId: ID,
  componentId: ID,
  capability: ID,
  attribute: ID,
  value: JSON_VALUE,
  unit: z.string().nullish(),
  data: z.record(z.string(), JSON_VALUE).nullish(),
  stateChange: z.boolean().nullish(),
});

export type SmartThingsDeviceEvent = z.infer<typeof DEVICE_EVENT_BODY>;

const WEBHOOK_EVENT = z.discriminatedUnion('eventType', [
  z.object({
    eventType: z.literal('DEVICE_EVENT'),
    eventTime: MOMENT,
    deviceEvent: DEVICE_EVENT_BODY,
  }),
  z.object({
    eventType: z.literal('DEVICE_LIFECYCLE_EVENT'),
    eventTime: MOMENT,
    deviceLifecycleEvent: z.object({ lifecycle: ID, deviceId: ID }),
  }),
  z.object({
    eventType: z.literal('DEVICE_HEALTH_EVENT'),
    eventTime: MOMENT,
    deviceHealthEvent: z.object({ deviceId: ID, status: ID }),
  }),
]);

export type WebhookEvent = z.infer<typeof WEBHOOK_EVENT>;

export const HANDLED_EVENT_TYPES: readonly WebhookEvent['eventType'][] = [
  'DEVICE_EVENT',
  'DEVICE_LIFECYCLE_EVENT',
  'DEVICE_HEALTH_EVENT',
];

export type WebhookEventEntry =
  | { readonly kind: 'event'; readonly event: WebhookEvent }
  | { readonly kind: 'ignored'; readonly eventType: string }
  | { readonly kind: 'unreadable'; readonly error: SmartThingsResponseError };

const ENVELOPE = z.object({
  lifecycle: z.string().nullish(),
  messageType: z.string().nullish(),
});

const PING = z.object({ pingData: z.object({ challenge: ID }) });

const CONFIRMATION = z.object({
  confirmationData: z.object({ appId: ID, confirmationUrl: z.url() }),
});

const EVENT = z.object({
  eventData: z.object({
    installedApp: z.object({ installedAppId: ID, locationId: ID.nullish() }),
    events: z.array(z.unknown()),
  }),
});

const EVENT_TYPE = z.object({ eventType: z.string() });

export type WebhookMessage =
  | { readonly kind: 'ping'; readonly challenge: string }
  | { readonly kind: 'confirmation'; readonly appId: string; readonly confirmationUrl: string }
  | {
      readonly kind: 'event';
      readonly installedAppId: string;
      readonly events: readonly WebhookEventEntry[];
    }
  | { readonly kind: 'ignored'; readonly lifecycle: string };

export function readWebhookEvent(received: unknown): WebhookEventEntry {
  const typed = EVENT_TYPE.safeParse(received);
  const eventType = typed.success ? typed.data.eventType : '';
  if (!HANDLED_EVENT_TYPES.some((handled) => handled === eventType)) {
    return { kind: 'ignored', eventType };
  }
  const event = WEBHOOK_EVENT.safeParse(received);
  return event.success
    ? { kind: 'event', event: event.data }
    : {
        kind: 'unreadable',
        error: new SmartThingsResponseError(`webhook ${eventType}`, received, event.error.message),
      };
}

export function readWebhookMessage(received: unknown): WebhookMessage {
  const envelope = parsed(ENVELOPE, received, 'webhook message');
  const lifecycle = envelope.lifecycle ?? envelope.messageType ?? '';
  switch (lifecycle) {
    case 'PING':
      return {
        kind: 'ping',
        challenge: parsed(PING, received, 'webhook PING').pingData.challenge,
      };
    case 'CONFIRMATION': {
      const data = parsed(CONFIRMATION, received, 'webhook CONFIRMATION').confirmationData;
      return { kind: 'confirmation', appId: data.appId, confirmationUrl: data.confirmationUrl };
    }
    case 'EVENT': {
      const data = parsed(EVENT, received, 'webhook EVENT').eventData;
      return {
        kind: 'event',
        installedAppId: data.installedApp.installedAppId,
        events: data.events.map(readWebhookEvent),
      };
    }
    default:
      return { kind: 'ignored', lifecycle };
  }
}

export function isSmartThingsUrl(url: string): boolean {
  const parsedUrl = new URL(url);
  return (
    parsedUrl.protocol === 'https:' &&
    parsedUrl.username === '' &&
    parsedUrl.password === '' &&
    parsedUrl.port === '' &&
    (parsedUrl.hostname === 'smartthings.com' || parsedUrl.hostname.endsWith('.smartthings.com'))
  );
}

export const WEBHOOK_EVENT_ANSWER = { eventData: {} } as const;

export function pingAnswer(challenge: string): Readonly<Record<string, unknown>> {
  return { pingData: { challenge } };
}
