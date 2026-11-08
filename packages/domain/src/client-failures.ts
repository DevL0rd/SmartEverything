import { z } from 'zod';
import { MOMENT } from './api/primitives';

export const CLIENT_NATIVE_TRACE = z.discriminatedUnion('state', [
  z.object({
    state: z.enum(['not_native', 'unsupported', 'unavailable', 'too_large', 'unreadable']),
  }),
  z.object({
    state: z.literal('java'),
    name: z.string().min(1).max(120),
    message: z.string().max(240).nullable(),
    frame: z.string().max(240).nullable(),
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

export type ClientProcessExit = z.output<typeof CLIENT_PROCESS_EXIT>;

export const CLIENT_PERF_REPORT = z.strictObject({
  at: MOMENT,
  release: z.string().min(1).max(40),
  screen: z.string().max(120),
  lines: z.array(z.string().max(400)).min(1).max(40),
});
