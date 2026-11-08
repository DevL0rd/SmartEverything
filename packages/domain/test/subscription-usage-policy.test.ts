import { describe, expect, it } from 'vitest';
import {
  subscriptionQuotaExhausted,
  type SubscriptionQuotaPolicy,
} from '../src/ai-subscription-policy';

const OPEN_QUOTA: SubscriptionQuotaPolicy = {
  allowed: true,
  restricted: false,
};

describe('subscriptionQuotaExhausted', () => {
  it.each([
    { ...OPEN_QUOTA, allowed: false },
    { ...OPEN_QUOTA, restricted: true },
  ])('reports the quota as exhausted for %j', (quota) => {
    expect(subscriptionQuotaExhausted([OPEN_QUOTA, quota])).toBe(true);
  });

  it('allows open quotas', () => {
    expect(subscriptionQuotaExhausted([OPEN_QUOTA])).toBe(false);
    expect(subscriptionQuotaExhausted([])).toBe(false);
  });
});
