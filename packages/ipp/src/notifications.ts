import { z } from 'zod';
import type { PlainObject } from './plain';
import { maybe, maybeSet, present, trySource, type DropReporter } from './schema-kit';

export interface SubscriptionGrant {
  readonly id: number;
  readonly leaseSeconds: number | null;
}

export interface PrinterEvent {
  readonly sequence: number;
  readonly events: readonly string[];
  readonly state: number | null;
  readonly reasons: readonly string[];
  readonly accepting: boolean | null;
  readonly jobId: number | null;
  readonly jobState: number | null;
  readonly text: string | null;
}

export const NOTIFY_EVENTS: readonly string[] = [
  'printer-state-changed',
  'printer-config-changed',
  'printer-stopped',
  'printer-restarted',
  'job-state-changed',
  'job-created',
  'job-completed',
  'job-progress',
];

const GRANT = z.object({
  'notify-subscription-id': z.number(),
  'notify-lease-duration': maybe(z.number()),
});

const EVENT = z.object({
  'notify-sequence-number': z.number(),
  'notify-subscribed-event': maybeSet(z.string()),
  'printer-state': maybe(z.number()),
  'printer-state-reasons': maybeSet(z.string()),
  'printer-is-accepting-jobs': maybe(z.boolean()),
  'job-id': maybe(z.number()),
  'job-state': maybe(z.number()),
  'notify-text': maybe(z.string()),
});

export function readGrant(plain: PlainObject, report?: DropReporter): SubscriptionGrant | null {
  const parsed = trySource(GRANT, present(plain), report);
  return parsed.success
    ? {
        id: parsed.data['notify-subscription-id'],
        leaseSeconds: parsed.data['notify-lease-duration'] ?? null,
      }
    : null;
}

export function readEvent(plain: PlainObject, report?: DropReporter): PrinterEvent | null {
  const parsed = trySource(EVENT, present(plain), report);
  if (!parsed.success) return null;
  const source = parsed.data;
  return {
    sequence: source['notify-sequence-number'],
    events: source['notify-subscribed-event'],
    state: source['printer-state'] ?? null,
    reasons: source['printer-state-reasons'].filter((reason) => reason !== 'none'),
    accepting: source['printer-is-accepting-jobs'] ?? null,
    jobId: source['job-id'] ?? null,
    jobState: source['job-state'] ?? null,
    text: source['notify-text'] ?? null,
  };
}
