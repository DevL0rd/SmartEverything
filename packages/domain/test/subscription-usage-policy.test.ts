import { describe, expect, it } from 'vitest';
import {
  SUBSCRIPTION_CREDIT_BALANCE,
  subscriptionUsagePolicy,
  type SubscriptionCreditPolicy,
  type SubscriptionQuotaPolicy,
} from '../src/ai-subscription-policy';

const NO_CREDITS: SubscriptionCreditPolicy = { hasCredits: false, unlimited: false, balance: null };
const OPEN_QUOTA: SubscriptionQuotaPolicy = {
  allowed: true,
  restricted: false,
  remainingPercent: 40,
  usedPercents: [60],
};

describe('subscriptionUsagePolicy', () => {
  it('allows paid usage when any credit source can be spent', () => {
    expect(subscriptionUsagePolicy([NO_CREDITS, { ...NO_CREDITS, hasCredits: true }], [])).toBe(
      'paid_usage_enabled',
    );
    expect(subscriptionUsagePolicy([{ ...NO_CREDITS, unlimited: true }], [])).toBe(
      'paid_usage_enabled',
    );
  });

  it('reads a decimal balance with any non-zero digit as spendable', () => {
    expect(subscriptionUsagePolicy([{ ...NO_CREDITS, balance: '0.05' }], [])).toBe(
      'paid_usage_enabled',
    );
    expect(subscriptionUsagePolicy([{ ...NO_CREDITS, balance: '10' }], [])).toBe(
      'paid_usage_enabled',
    );
    expect(subscriptionUsagePolicy([{ ...NO_CREDITS, balance: '0.00' }], [OPEN_QUOTA])).toBe(
      'disabled',
    );
  });

  it('fails loudly on a balance that is not a plain decimal', () => {
    expect(() => subscriptionUsagePolicy([{ ...NO_CREDITS, balance: ' 5' }], [])).toThrow();
    expect(SUBSCRIPTION_CREDIT_BALANCE.safeParse('1.5').success).toBe(true);
    expect(SUBSCRIPTION_CREDIT_BALANCE.safeParse('-1').success).toBe(false);
  });

  it.each([
    { ...OPEN_QUOTA, allowed: false },
    { ...OPEN_QUOTA, restricted: true },
    { ...OPEN_QUOTA, remainingPercent: 0 },
    { ...OPEN_QUOTA, usedPercents: [20, 100] },
  ])('reports the quota as exhausted for %j', (quota) => {
    expect(subscriptionUsagePolicy([NO_CREDITS], [OPEN_QUOTA, quota])).toBe('quota_exhausted');
  });

  it('prefers paid usage over an exhausted quota', () => {
    expect(
      subscriptionUsagePolicy(
        [{ ...NO_CREDITS, hasCredits: true }],
        [{ ...OPEN_QUOTA, allowed: false }],
      ),
    ).toBe('paid_usage_enabled');
  });

  it('is disabled with open quotas, an unknown remainder, and nothing at all', () => {
    expect(subscriptionUsagePolicy([NO_CREDITS], [OPEN_QUOTA])).toBe('disabled');
    expect(
      subscriptionUsagePolicy([], [{ ...OPEN_QUOTA, remainingPercent: null, usedPercents: [] }]),
    ).toBe('disabled');
    expect(subscriptionUsagePolicy([], [])).toBe('disabled');
  });
});
