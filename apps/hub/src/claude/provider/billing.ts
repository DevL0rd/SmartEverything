import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Logger } from '@smarteverything/logging';
import {
  CLAUDE_BILLING_NOTICES,
  SUBSCRIPTION_WEEK_MINUTES,
  claudeBillingReason,
  type ClaudeBillingCode,
  type AiSubscriptionUsage,
} from '@smarteverything/domain';
import { ProviderInputError } from './input';
const WINDOW = z.object({
  utilization: z.number().nonnegative().nullable(),
  resets_at: z.string().nullable().optional(),
});
const SPEND_POLICY = z.object({
  rate_limits_available: z.literal(true),
  rate_limits: z.object({
    extra_usage: z.object({ is_enabled: z.boolean() }),
    model_scoped: z.array(z.unknown()).optional(),
  }),
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
  }),
});
type Limits = z.infer<typeof USAGE>['rate_limits'];
const RESET = z.iso.datetime({ offset: true });
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
  observe?: (usage: AiSubscriptionUsage) => void,
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
  const parsed = SPEND_POLICY.safeParse(raw);
  if (!parsed.success)
    return blocked(
      'native_billing_policy_unknown',
      'The usage response omitted extra usage policy.',
    );
  const telemetry = USAGE.safeParse(raw);
  if (
    telemetry.success &&
    observe !== undefined &&
    staleReason(telemetry.data.rate_limits, now) === null
  )
    observe(claudeStatusUsage(telemetry.data.rate_limits, now));
  if (parsed.data.rate_limits.extra_usage.is_enabled)
    return blocked('native_paid_extra_usage_enabled');
  if (parsed.data.rate_limits.model_scoped === undefined)
    return blocked(
      'native_billing_freshness_unavailable',
      'The provider did not verify current extra usage settings.',
    );
  return { state: 'eligible' };
}

function claudeStatusUsage(limits: Limits, observedAt: number): AiSubscriptionUsage {
  return {
    runtime: 'claude',
    reported_at: new Date(observedAt).toISOString(),
    status: 'reported',
    windows: (['five_hour', 'seven_day'] as const).map((id) => {
      const window = limits[id];
      const reset = RESET.safeParse(window.resets_at);
      return {
        id,
        label: id,
        used_percent: window.utilization,
        resets_at: reset.success ? reset.data : null,
        window_duration_mins: id === 'seven_day' ? SUBSCRIPTION_WEEK_MINUTES : null,
      };
    }),
  };
}
export async function requireNativeSubscriptionBilling(
  runtime: Query,
  log?: Logger,
): Promise<void> {
  const verdict = await nativeSubscriptionBilling(runtime);
  if (verdict.state === 'blocked') {
    log?.warn('claude.billing_blocked', { code: verdict.code, detail: verdict.detail });
    throw new ClaudeSubscriptionBillingError(verdict.code, verdict.reason, verdict.detail);
  }
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
