import { z } from 'zod';
export * from './ai-subscription-policy';
export const AI_SUBSCRIPTION_USAGE = z.strictObject({
  runtime: z.enum(['claude', 'codex']),
  reported_at: z.iso.datetime({ offset: true }),
  status: z.enum(['reported', 'unavailable']),
  windows: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(300),
        label: z.string().min(1).max(300),
        used_percent: z.number().nonnegative().nullable(),
        resets_at: z.iso.datetime({ offset: true }).nullable(),
        window_duration_mins: z.number().positive().nullable(),
      }),
    )
    .max(200),
});
export type AiSubscriptionUsage = z.infer<typeof AI_SUBSCRIPTION_USAGE>;
