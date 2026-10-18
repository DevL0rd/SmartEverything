import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import {
  CLAUDE_BILLING_NOTICES,
  claudeBillingReason,
  type ClaudeBillingCode,
} from '@smarteverything/domain';
import { ProviderInputError } from './input';
const WINDOW = z.object({
  utilization: z.number().nonnegative().nullable(),
  resets_at: z.string().nullable().optional(),
});
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
type Limits = z.infer<typeof USAGE>['rate_limits'];
interface ClaudeBillingBlocked {
  readonly state: 'blocked';
  readonly code: ClaudeBillingCode;
  readonly reason: string;
  readonly detail: string;
}
export type ClaudeBillingVerdict = { readonly state: 'eligible' } | ClaudeBillingBlocked;
export class ClaudeSubscriptionBillingError extends ProviderInputError {
  override readonly name = 'ClaudeSubscriptionBillingError';
  constructor(
    readonly code: ClaudeBillingCode,
    reason: string,
    readonly detail: string,
  ) {
    super(reason);
  }
}
export async function nativeSubscriptionBilling(
  runtime: Query,
  now: number = Date.now(),
): Promise<ClaudeBillingVerdict> {
  let raw: unknown;
  try {
    raw = await runtime.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
      skipBehaviors: true,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    return blocked('native_billing_policy_unknown', `The usage request failed: ${cause.message}`);
  }
  const parsed = USAGE.safeParse(raw);
  if (!parsed.success)
    return blocked('native_billing_policy_unknown', 'The usage response had an unexpected shape.');
  const limits = parsed.data.rate_limits;
  if (limits.extra_usage.is_enabled) return blocked('native_paid_extra_usage_enabled');
  if (exhaustedUsage(limits)) return blocked('native_quota_exhausted');
  if (limits.five_hour.utilization === null || limits.seven_day.utilization === null)
    return blocked('native_billing_policy_unknown', 'A subscription window reported no usage.');
  const staleness = staleReason(limits, now);
  return staleness === null
    ? { state: 'eligible' }
    : blocked('native_billing_freshness_unavailable', staleness);
}
export async function requireNativeSubscriptionBilling(runtime: Query): Promise<void> {
  const verdict = await nativeSubscriptionBilling(runtime);
  if (verdict.state === 'blocked')
    throw new ClaudeSubscriptionBillingError(verdict.code, verdict.reason, verdict.detail);
}
function blocked(code: ClaudeBillingCode, cause?: string): ClaudeBillingBlocked {
  const notice = CLAUDE_BILLING_NOTICES[code];
  return {
    state: 'blocked',
    code,
    reason: claudeBillingReason(notice),
    detail: cause === undefined ? notice.detail : `${notice.detail} (${cause})`,
  };
}
function windowsOf(limits: Limits): readonly NonNullable<Limits['seven_day_opus']>[] {
  return [
    limits.five_hour,
    limits.seven_day,
    limits.seven_day_oauth_apps,
    limits.seven_day_opus,
    limits.seven_day_sonnet,
    ...(limits.model_scoped ?? []),
  ].filter((window) => window !== null && window !== undefined);
}
function staleReason(limits: Limits, now: number): string | null {
  if (limits.model_scoped === undefined)
    return 'The SDK omits model_scoped for answers served from cached data.';
  for (const window of windowsOf(limits)) {
    if (window.resets_at === null || window.resets_at === undefined) continue;
    const resetsAt = Date.parse(window.resets_at);
    if (Number.isNaN(resetsAt) || resetsAt <= now)
      return 'A usage window has a reset time that is unreadable or already past.';
  }
  return null;
}
function exhaustedUsage(limits: Limits): boolean {
  return windowsOf(limits).some(
    (window) => window.utilization !== null && window.utilization >= 100,
  );
}
