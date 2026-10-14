import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { ProviderInputError } from './input';
const WINDOW = z.object({ utilization: z.number().nonnegative().nullable() });
const USAGE = z.object({
  subscription_type: z.string().min(1),
  rate_limits_available: z.literal(true),
  rate_limits: z.object({
    five_hour: WINDOW,
    seven_day: WINDOW,
    seven_day_oauth_apps: WINDOW.nullable().optional(),
    seven_day_opus: WINDOW.nullable().optional(),
    seven_day_sonnet: WINDOW.nullable().optional(),
    model_scoped: z.array(WINDOW).optional(),
    extra_usage: z.object({ is_enabled: z.boolean() }),
  }),
});
export interface ClaudeBillingBlock {
  readonly code: string;
  readonly reason: string;
}
export class ClaudeSubscriptionBillingError extends ProviderInputError {
  override readonly name = 'ClaudeSubscriptionBillingError';
  constructor(
    readonly code: string,
    reason: string,
  ) {
    super(reason);
  }
}
export async function nativeSubscriptionBilling(runtime: Query): Promise<ClaudeBillingBlock> {
  let raw: unknown;
  try {
    raw = await runtime.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
      skipBehaviors: true,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    return unknownPolicy();
  }
  const parsed = USAGE.safeParse(raw);
  if (!parsed.success) return unknownPolicy();
  const limits = parsed.data.rate_limits;
  if (limits.extra_usage.is_enabled)
    return {
      code: 'native_paid_extra_usage_enabled',
      reason: 'Claude reports paid extra usage enabled. Subscription-only inference is blocked.',
    };
  if (exhaustedUsage(limits))
    return {
      code: 'native_quota_exhausted',
      reason:
        'Claude included subscription usage is exhausted. No extra-usage or API fallback will be used.',
    };
  if (limits.five_hour.utilization === null || limits.seven_day.utilization === null)
    return unknownPolicy();
  return {
    code: 'native_billing_freshness_unavailable',
    reason:
      'Claude’s current native connection cannot verify that paid extra usage is off using fresh account information. Subscription inference is temporarily blocked. You can still connect and view models.',
  };
}
export async function requireNativeSubscriptionBilling(runtime: Query): Promise<void> {
  const blocked = await nativeSubscriptionBilling(runtime);
  throw new ClaudeSubscriptionBillingError(blocked.code, blocked.reason);
}
function unknownPolicy(): ClaudeBillingBlock {
  return {
    code: 'native_billing_policy_unknown',
    reason:
      'Claude native usage cannot verify included quota and paid extra-usage policy. Subscription inference is blocked.',
  };
}

function exhaustedUsage(limits: z.infer<typeof USAGE>['rate_limits']): boolean {
  const windows = [
    limits.five_hour,
    limits.seven_day,
    limits.seven_day_oauth_apps,
    limits.seven_day_opus,
    limits.seven_day_sonnet,
    ...(limits.model_scoped ?? []),
  ];
  return windows.some(
    (window) =>
      window !== null &&
      window !== undefined &&
      window.utilization !== null &&
      window.utilization >= 100,
  );
}
