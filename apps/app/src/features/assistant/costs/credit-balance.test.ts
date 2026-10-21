import { describe, expect, it } from 'vitest';
import type { OpenRouterAccount } from '@smarteverything/domain';
import { moneyOf } from '../../region/model/money';
import { balanceOf, isLow, usedLine } from './credit-balance';

const dollars = moneyOf({
  currency: 'USD',
  locale: 'en-US',
  rate: 1,
  rateDate: null,
  notice: null,
});

const key = {
  label: 'key',
  limit: 50,
  limit_remaining: 40.961064757,
  limit_reset: 'monthly',
  usage: 9.038935243,
  usage_daily: 0.401184188,
  usage_weekly: 0.497510448,
  usage_monthly: 9.038935243,
  free_tier: false,
  checked_at: '2026-10-20T22:28:18.458Z',
} as const;

const known: OpenRouterAccount = {
  ...key,
  credits: { state: 'known', total: 1075, used: 1064.411846749 },
};

describe('account credit balance', () => {
  it('is what is left of all credits ever bought, not this key’s limit', () => {
    const balance = balanceOf(known);
    expect(balance?.left).toBeCloseTo(10.588153251, 9);
    expect(balance?.left).not.toBeCloseTo(key.limit_remaining, 3);
  });

  it('names the figure as covering all keys and all time next to the per-key month spend', () => {
    const balance = balanceOf(known);
    expect(balance === null ? null : usedLine(balance, dollars)).toBe(
      'All keys, all time: $1,064.41 used of $1,075.00',
    );
  });

  it('never goes below zero when usage passes the credits bought', () => {
    const over: OpenRouterAccount = {
      ...key,
      credits: { state: 'known', total: 10, used: 10.5 },
    };
    expect(balanceOf(over)?.left).toBe(0);
  });

  it('is unknown for a key that cannot read the balance', () => {
    expect(balanceOf({ ...key, credits: { state: 'needs_management_key' } })).toBeNull();
  });

  it('is low below one dollar and not at one dollar', () => {
    expect(isLow({ left: 0.99, total: 10, used: 9.01 })).toBe(true);
    expect(isLow({ left: 1, total: 10, used: 9 })).toBe(false);
  });
});
