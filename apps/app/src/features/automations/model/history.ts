import { z } from 'zod';
import type { EventRow } from '@smarteverything/domain';
import { count, decimal, withUnit } from '../../../format/number';

const RUN_DETAILS = z.object({
  automationId: z.string(),
  name: z.string(),
  outcome: z.enum(['succeeded', 'failed']),
  durationMs: z.number(),
  error: z.string().nullable(),
});

const NOTICE_DETAILS = z.object({
  automationId: z.string(),
  name: z.string(),
  message: z.string(),
});

export interface Run {
  readonly id: string;
  readonly automationId: string;
  readonly name: string;
  readonly at: string;
  readonly outcome: 'succeeded' | 'failed';
  readonly durationMs: number;
  readonly error: string | null;
}

interface Notice {
  readonly automationId: string;
  readonly at: string;
  readonly message: string;
}

const NOTICE_GRACE_MS = 5000;

export function runsOf(events: readonly EventRow[], automationId: string | null): Run[] {
  return events.flatMap((event) => {
    if (event.kind !== 'automation_run') {
      return [];
    }
    const details = RUN_DETAILS.safeParse(event.details);
    if (!details.success) {
      return [];
    }
    if (automationId !== null && details.data.automationId !== automationId) {
      return [];
    }
    return [{ id: event.id, at: event.occurred_at, ...details.data }];
  });
}

function noticesOf(events: readonly EventRow[]): Notice[] {
  return events.flatMap((event) => {
    if (event.kind !== 'automation_run') {
      return [];
    }
    const details = NOTICE_DETAILS.safeParse(event.details);
    return details.success
      ? [
          {
            automationId: details.data.automationId,
            at: event.occurred_at,
            message: details.data.message,
          },
        ]
      : [];
  });
}

export function noticesDuring(events: readonly EventRow[], run: Run): string[] {
  const start = Date.parse(run.at);
  const end = start + run.durationMs + NOTICE_GRACE_MS;
  return noticesOf(events)
    .filter((notice) => {
      const at = Date.parse(notice.at);
      return notice.automationId === run.automationId && at >= start && at <= end;
    })
    .map((notice) => notice.message);
}

export function tookText(durationMs: number): string {
  return durationMs < 1000
    ? withUnit(count(durationMs), 'ms')
    : withUnit(decimal(durationMs / 1000, 1), 's');
}
