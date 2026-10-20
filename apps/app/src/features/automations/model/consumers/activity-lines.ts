import { z } from 'zod';
import type { EventRow } from '@smarteverything/domain';
import type { IconName } from '../../../../components/icon';
import type { Tone } from '../../../../components/tone';

export interface RunLine {
  readonly id: string;
  readonly kind: 'event';
  readonly group: string;
  readonly at: string;
  readonly deviceId: null;
  readonly name: string;
  readonly what: string;
  readonly topic: string;
  readonly by: null;
  readonly icon: IconName;
  readonly tone: Tone;
  readonly category: 'automations';
  readonly failed: boolean;
}

const OUTCOME = z.enum(['succeeded', 'failed', 'cancelled', 'interrupted', 'ignored']);

const RUN_DETAILS = z.object({
  name: z.string().min(1),
  outcome: OUTCOME.optional(),
  message: z.string().min(1).optional(),
});

type Outcome = z.infer<typeof OUTCOME>;

const WHAT: Readonly<Record<Outcome, string>> = {
  succeeded: 'Ran',
  failed: 'Didn’t finish',
  interrupted: 'Didn’t finish',
  cancelled: 'Stopped',
  ignored: 'Skipped',
};

const FAILED: ReadonlySet<Outcome> = new Set(['failed', 'interrupted']);

function whatOf(outcome: Outcome | undefined, message: string | undefined): string {
  return outcome === undefined ? (message ?? 'Ran') : WHAT[outcome];
}

type Details = z.infer<typeof RUN_DETAILS>;

function readDetails(event: EventRow): Details | undefined {
  const details = RUN_DETAILS.safeParse(event.details);
  return details.success ? details.data : undefined;
}

function failedOf(read: Details | undefined): boolean {
  return read?.outcome !== undefined && FAILED.has(read.outcome);
}

export function automationRunAtom(event: EventRow): RunLine {
  const read = readDetails(event);
  const failed = failedOf(read);
  return {
    id: `event:${event.id}`,
    kind: 'event',
    group: `automation:${read?.name ?? event.id}`,
    at: event.occurred_at,
    deviceId: null,
    name: read?.name ?? 'An automation',
    what: whatOf(read?.outcome, read?.message),
    topic: 'Ran',
    by: null,
    icon: failed ? 'alert' : 'automations',
    tone: failed ? 'critical' : 'variant',
    category: 'automations',
    failed,
  };
}
