import { z } from 'zod';
import { MOMENT } from './api/primitives';

export const CLIENT_FAILURES_MAX = 40;

export const CLIENT_CRUMBS_MAX = 12;

export const CLIENT_FAILURE_LEVELS = ['warn', 'error', 'exception'] as const;

export const CLIENT_NATIVE_TRACE = z.discriminatedUnion('state', [
  z.object({
    state: z.enum(['not_native', 'unsupported', 'unavailable', 'too_large', 'unreadable']),
  }),
  z.object({
    state: z.literal('captured'),
    signal: z.int(),
    signalCode: z.int(),
    frames: z
      .array(
        z.object({
          module: z.string().max(240).nullable(),
          function: z.string().max(240).nullable(),
          relativePc: z.string().regex(/^[a-f0-9]{1,16}$/),
        }),
      )
      .max(24),
  }),
]);

export const CLIENT_PROCESS_EXIT = z.object({
  at: MOMENT,
  reason: z.string().min(1).max(80),
  status: z.int(),
  process: z.string().min(1).max(200),
  description: z.string().max(240).nullable(),
  nativeTrace: CLIENT_NATIVE_TRACE.optional(),
});

export const CLIENT_FAILURE = z.object({
  at: MOMENT,
  level: z.enum(CLIENT_FAILURE_LEVELS),
  scope: z.string().min(1).max(60),
  event: z.string().min(1).max(80),
  screen: z.string().max(120).nullable(),
  name: z.string().max(80).nullable(),
  message: z.string().max(400).nullable(),
  stack: z.string().max(1200).nullable(),
  processExit: CLIENT_PROCESS_EXIT.optional(),
});

export type ClientFailure = z.output<typeof CLIENT_FAILURE>;

const CLIENT_CRUMB = z.object({
  at: MOMENT,
  scope: z.string().min(1).max(60),
  event: z.string().min(1).max(80),
  screen: z.string().max(120).nullable(),
});

export type ClientCrumb = z.output<typeof CLIENT_CRUMB>;

export const CLIENT_FAILURE_REPORT = z.object({
  release: z.string().min(1).max(40),
  platform: z.enum(['android', 'ios', 'web']),
  failures: z.array(CLIENT_FAILURE).min(1).max(CLIENT_FAILURES_MAX),
  recent: z.array(CLIENT_CRUMB).max(CLIENT_CRUMBS_MAX).default([]),
});

export type ClientFailureReport = z.input<typeof CLIENT_FAILURE_REPORT>;
