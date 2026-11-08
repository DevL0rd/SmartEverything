import { describe, expect, it } from 'vitest';
import { providerMetadata } from '../../src/codex/provider-metadata';
import type { RpcRecord } from '../../src/codex/protocol';
import { readRateLimits, requireSubscriptionBilling } from '../../src/codex/rate-limits';

const CREDITS = { hasCredits: true, unlimited: true, balance: '10.5' };
const SNAPSHOT = {
  limitId: 'codex',
  limitName: null,
  normalModelSlug: null,
  primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: null },
  secondary: null,
  individualLimit: { limit: '10', used: '10', remainingPercent: 0, resetsAt: 0 },
};

function usage(credits: typeof CREDITS | undefined, restriction: RpcRecord = {}): RpcRecord {
  return {
    ordinaryUsageAllowed: true,
    rateLimits: { ...SNAPSHOT, ...(credits === undefined ? {} : { credits }) },
    rateLimitsByLimitId: { other: { ...SNAPSHOT, ...restriction } },
  };
}

describe('native Codex subscription admission', () => {
  it.each([CREDITS, undefined])(
    'allows affirmative usage with a full window and credit metadata %j',
    (credits) => {
      const rates = usage(credits);
      expect(providerMetadata(rates, 'test').initialization['billing_guard']).toEqual({
        state: 'eligible',
      });
      expect((): void => {
        requireSubscriptionBilling(rates);
      }).not.toThrow();
    },
  );

  it.each([{ rateLimitReachedType: 'rate_limit_reached' }, { spendControlReached: true }])(
    'blocks discovery and admission when Codex restricts an additional quota %j',
    (restriction) => {
      const rates = usage(CREDITS, restriction);
      expect(providerMetadata(rates, 'test').initialization['billing_guard']).toMatchObject({
        state: 'blocked',
        code: 'native_quota_exhausted',
      });
      expect((): void => {
        requireSubscriptionBilling(rates);
      }).toThrow('Codex reports that usage is exhausted or restricted for this account.');
    },
  );

  it('retains reported windows and credits when included usage permission is absent', async () => {
    const rates = await readRateLimits({
      request: () =>
        Promise.resolve({ rateLimits: { primary: { usedPercent: 25 }, credits: CREDITS } }),
    });
    expect(rates).toMatchObject({
      ordinaryUsageAllowed: null,
      rateLimits: { primary: { usedPercent: 25 }, credits: CREDITS },
    });
    expect(() => {
      requireSubscriptionBilling(rates);
    }).toThrow('Codex cannot verify usage availability for this account.');
  });

  it('requires the account to report whether ordinary usage is allowed', () => {
    expect((): void => {
      requireSubscriptionBilling({ ...usage(CREDITS), ordinaryUsageAllowed: null });
    }).toThrow('Codex cannot verify usage availability for this account.');
  });

  it('honors a provider denial despite available credits', () => {
    expect((): void => {
      requireSubscriptionBilling({ ...usage(CREDITS), ordinaryUsageAllowed: false });
    }).toThrow('Codex reports that usage is exhausted or restricted for this account.');
  });
});
