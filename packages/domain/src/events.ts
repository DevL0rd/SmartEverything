import { z } from 'zod';
import { JSON_VALUE } from './values';

export const EVENT_KINDS = [
  'doorbell',
  'call',
  'motion',
  'person',
  'sound',
  'alarm',
  'button',
  'leak',
  'smoke',
  'device_online',
  'device_offline',
  'automation_run',
  'provider_error',
  'pet',
  'opened',
  'maintenance',
  'fault',
  'activity',
  'computer_power',
  'phone_context_changed',
  'place_arrived',
  'place_left',
  'parked',
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export const DEVICE_EVENT = z.object({
  externalId: z.string().min(1),
  kind: z.enum(EVENT_KINDS),
  occurredAt: z.iso.datetime({ offset: true }),
  details: z.record(z.string(), JSON_VALUE),
});

export type DeviceEvent = z.infer<typeof DEVICE_EVENT>;

const URGENT: ReadonlySet<EventKind> = new Set(['doorbell', 'call', 'alarm', 'leak', 'smoke']);

export function isUrgent(kind: EventKind): boolean {
  return URGENT.has(kind);
}

export function pushedMessageOf(
  kind: EventKind,
  details: Readonly<Record<string, unknown>>,
): string | null {
  const message = details['message'];
  return kind === 'automation_run' && typeof message === 'string' && message !== ''
    ? message
    : null;
}

export function isPushed(kind: EventKind, details: Readonly<Record<string, unknown>>): boolean {
  return isUrgent(kind) || pushedMessageOf(kind, details) !== null;
}
