import { z } from 'zod';
import { jsonEquals } from './comparison';
import { SIGNAL_TIMING_SHAPE, signalOptionsError } from './signal-timing';
import { SIGNAL_SOURCE_NAME, type SignalInput } from './signals';
import { JSON_VALUE } from './values';

const TEXT = z.string().trim().min(1);

export const SIGNAL_MATCHER = z
  .strictObject({
    source: SIGNAL_SOURCE_NAME,
    kind: TEXT,
    subject: TEXT.optional(),
    field: TEXT.optional(),
    match: z.record(TEXT, JSON_VALUE).optional(),
    ...SIGNAL_TIMING_SHAPE,
  })
  .superRefine((matcher, context) => {
    const message = signalOptionsError(matcher);
    if (message !== null) context.addIssue({ code: 'custom', message });
  });

export type SignalMatcher = z.output<typeof SIGNAL_MATCHER>;

export function signalMatches(matcher: SignalMatcher, signal: SignalInput): boolean {
  return (
    matcher.source === signal.source &&
    matcher.kind === signal.kind &&
    (matcher.subject === undefined || matcher.subject === signal.subject) &&
    (matcher.field === undefined || matcher.field === signal.field) &&
    Object.entries(matcher.match ?? {}).every(([key, value]) => {
      const actual = signal.data[key];
      return actual !== undefined && jsonEquals(actual, value);
    })
  );
}
