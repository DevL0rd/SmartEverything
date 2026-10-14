import { z } from 'zod';

export const SUBSCRIPTION_CREDIT_BALANCE = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .refine((balance) => balance.trim() === balance, 'Credit balance cannot contain whitespace.');

export interface SubscriptionCreditPolicy {
  readonly hasCredits: boolean;
  readonly unlimited: boolean;
  readonly balance: string | null;
}

export interface SubscriptionQuotaPolicy {
  readonly allowed: boolean;
  readonly restricted: boolean;
  readonly remainingPercent: number | null;
  readonly usedPercents: readonly number[];
}

export function subscriptionUsagePolicy(
  credits: readonly SubscriptionCreditPolicy[],
  quotas: readonly SubscriptionQuotaPolicy[],
): 'disabled' | 'paid_usage_enabled' | 'quota_exhausted' {
  if (credits.some(spendableCredits)) return 'paid_usage_enabled';
  if (quotas.some(exhaustedQuota)) return 'quota_exhausted';
  return 'disabled';
}

function spendableCredits(credits: SubscriptionCreditPolicy): boolean {
  return (
    credits.hasCredits ||
    credits.unlimited ||
    (credits.balance !== null && /[1-9]/.test(SUBSCRIPTION_CREDIT_BALANCE.parse(credits.balance)))
  );
}

function exhaustedQuota(quota: SubscriptionQuotaPolicy): boolean {
  return (
    !quota.allowed ||
    quota.restricted ||
    (quota.remainingPercent !== null && quota.remainingPercent <= 0) ||
    quota.usedPercents.some((used) => used >= 100)
  );
}
