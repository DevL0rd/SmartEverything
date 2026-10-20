import { z } from 'zod';
import { StateInputError } from './adapter';

const DAY_MS = 86_400_000;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function clockMs(text: string): number {
  const match = CLOCK.exec(text);
  if (match === null) throw new StateInputError(`"${text}" is not a time of day such as 21:30`);
  return (Number(match[1]) * 60 + Number(match[2])) * 60_000;
}

export const QUIET_HOURS_REQUEST = z.strictObject({
  msOfDay: z.number().min(0).lt(DAY_MS),
  from: z.string(),
  to: z.string(),
  priority: z.number().int().default(0),
  bypass: z.number().int().optional(),
  quiet: z.enum(['wait', 'skip']).default('wait'),
});
export type QuietHoursRequest = z.input<typeof QUIET_HOURS_REQUEST>;

export type QuietHoursOutcome =
  { readonly exit: 'pass'; readonly holdMs: number } | { readonly exit: 'held' };

function inside(msOfDay: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from < to ? msOfDay >= from && msOfDay < to : msOfDay >= from || msOfDay < to;
}

export function quietHours(input: QuietHoursRequest): QuietHoursOutcome {
  const request = QUIET_HOURS_REQUEST.parse(input);
  const from = clockMs(request.from);
  const to = clockMs(request.to);
  const urgent = request.bypass !== undefined && request.priority >= request.bypass;
  if (urgent || !inside(request.msOfDay, from, to)) return { exit: 'pass', holdMs: 0 };
  if (request.quiet === 'skip') return { exit: 'held' };
  return { exit: 'pass', holdMs: (to - request.msOfDay + DAY_MS) % DAY_MS };
}
