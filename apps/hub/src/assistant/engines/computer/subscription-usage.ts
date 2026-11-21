import { z } from 'zod';
import { AI_SUBSCRIPTION_USAGE, type AiSubscriptionUsage } from '@smarteverything/domain';
import type { ComputerEvent } from './provider-state';
import { codexUsage } from '../../../codex/subscription-usage';
const CLAUDE_LIMIT = z.object({
  status: z.string(),
  rateLimitType: z.string().optional(),
  utilization: z.number().nonnegative().optional(),
  resetsAt: z.number().optional(),
});
export async function subscriptionUsage(
  event: ComputerEvent,
  now: string,
  previous: () => Promise<AiSubscriptionUsage | undefined>,
): Promise<
  { readonly current: AiSubscriptionUsage; readonly observed: AiSubscriptionUsage } | undefined
> {
  if (event.kind === 'usage' && 'usage' in event) {
    if (event.subscription_usage === undefined) return undefined;
    return {
      current: codexUsage(event.usage.rate_limits, event.subscription_usage.reported_at),
      observed: event.subscription_usage,
    };
  }
  if (event.kind !== 'runtime' || event.type !== 'rate_limit_event') return undefined;
  const parsed = CLAUDE_LIMIT.safeParse(event.payload['rate_limit_info']);
  if (!parsed.success) return undefined;
  const observed = claudeUsage(parsed.data, now);
  const id = parsed.data.rateLimitType ?? 'unknown';
  const known = await previous();
  return {
    observed,
    current: {
      ...observed,
      windows: [
        ...(known?.runtime === 'claude' ? known.windows.filter((item) => item.id !== id) : []),
        ...observed.windows,
      ],
    },
  };
}
function claudeUsage(info: z.infer<typeof CLAUDE_LIMIT>, now: string): AiSubscriptionUsage {
  const id = info.rateLimitType ?? 'unknown';
  const window = {
    id,
    label: id,
    used_percent: info.utilization === undefined ? null : info.utilization * 100,
    resets_at: info.resetsAt === undefined ? null : new Date(info.resetsAt * 1000).toISOString(),
    window_duration_mins: null,
  };
  return AI_SUBSCRIPTION_USAGE.parse({
    runtime: 'claude',
    reported_at: now,
    status: 'reported',
    windows: [window],
  });
}
