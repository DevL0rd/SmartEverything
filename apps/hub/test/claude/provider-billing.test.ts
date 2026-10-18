import { describe, expect, it } from 'vitest';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { CLAUDE_BILLING_NOTICES, claudeBillingReason } from '@smarteverything/domain';
import {
  ClaudeSubscriptionBillingError,
  nativeSubscriptionBilling,
  requireNativeSubscriptionBilling,
} from '../../src/claude/provider/billing';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const FUTURE = '2026-10-23T14:00:00Z';
const PAST = '2026-10-01T14:00:00Z';

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- partial fake of the SDK query
function loose<T>(value: object): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- same partial fake
  return Object.assign(Object.create(null), value);
}

function window(utilization: number | null, resets_at: string | null = FUTURE): object {
  return { utilization, resets_at };
}

function limits(overrides: Record<string, unknown> = {}): object {
  return {
    five_hour: window(0, null),
    seven_day: window(12),
    seven_day_opus: null,
    seven_day_sonnet: window(3),
    model_scoped: [window(0)],
    extra_usage: { is_enabled: false },
    ...overrides,
  };
}

function usage(rateLimits: object | null, overrides: Record<string, unknown> = {}): object {
  return {
    subscription_type: 'max',
    rate_limits_available: rateLimits !== null,
    rate_limits: rateLimits,
    ...overrides,
  };
}

function runtime(reply: () => Promise<unknown>): Query {
  return loose<Query>({ usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: reply });
}

function answering(value: object): Query {
  return runtime(() => Promise.resolve(value));
}

function blockedWith(code: keyof typeof CLAUDE_BILLING_NOTICES): object {
  return {
    state: 'blocked',
    code,
    reason: claudeBillingReason(CLAUDE_BILLING_NOTICES[code]),
  };
}

describe('native subscription billing gate', () => {
  it('allows inference when the answer is live, extra usage is off and no window is exhausted', async () => {
    const verdict = await nativeSubscriptionBilling(answering(usage(limits())), NOW);
    expect(verdict).toEqual({ state: 'eligible' });
    await expect(
      requireNativeSubscriptionBilling(answering(usage(limits()))),
    ).resolves.toBeUndefined();
  });

  it('allows an account with no model-scoped windows when the endpoint answered with an empty list', async () => {
    const verdict = await nativeSubscriptionBilling(
      answering(usage(limits({ model_scoped: [] }))),
      NOW,
    );
    expect(verdict).toEqual({ state: 'eligible' });
  });

  it('blocks when paid extra usage is enabled', async () => {
    const verdict = await nativeSubscriptionBilling(
      answering(usage(limits({ extra_usage: { is_enabled: true } }))),
      NOW,
    );
    expect(verdict).toMatchObject(blockedWith('native_paid_extra_usage_enabled'));
  });

  it.each([
    ['five_hour', { five_hour: window(100, null) }],
    ['seven_day', { seven_day: window(100) }],
    ['seven_day_sonnet', { seven_day_sonnet: window(101) }],
    ['model_scoped', { model_scoped: [window(0), window(100)] }],
  ])('blocks as exhausted when %s is full', async (_name, overrides) => {
    const verdict = await nativeSubscriptionBilling(answering(usage(limits(overrides))), NOW);
    expect(verdict).toMatchObject(blockedWith('native_quota_exhausted'));
  });

  it('blocks as unknown when a main window reports no utilization', async () => {
    const verdict = await nativeSubscriptionBilling(
      answering(usage(limits({ five_hour: window(null, null) }))),
      NOW,
    );
    expect(verdict).toMatchObject(blockedWith('native_billing_policy_unknown'));
  });

  it.each([
    ['plan limits not available', usage(null)],
    ['no subscription type', usage(limits(), { subscription_type: null })],
    ['missing extra usage', usage(limits({ extra_usage: null }))],
  ])('blocks as unknown when %s', async (_name, value) => {
    const verdict = await nativeSubscriptionBilling(answering(value), NOW);
    expect(verdict).toMatchObject(blockedWith('native_billing_policy_unknown'));
  });

  it('blocks as unknown when the usage request fails', async () => {
    const verdict = await nativeSubscriptionBilling(
      runtime(() => Promise.reject(new Error('offline'))),
      NOW,
    );
    expect(verdict).toMatchObject(blockedWith('native_billing_policy_unknown'));
  });

  it('rethrows a non-error rejection', async () => {
    await expect(
      nativeSubscriptionBilling(
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- proves non-Error rejections are not swallowed
        runtime(() => Promise.reject('boom')),
        NOW,
      ),
    ).rejects.toBe('boom');
  });

  it('blocks as stale when the answer omits model-scoped windows (served from cache)', async () => {
    const cached = limits({ model_scoped: undefined });
    const verdict = await nativeSubscriptionBilling(answering(usage(cached)), NOW);
    expect(verdict).toMatchObject(blockedWith('native_billing_freshness_unavailable'));
  });

  it.each([
    ['already past', PAST],
    ['unreadable', 'soon'],
  ])('blocks as stale when a reset time is %s', async (_name, resetsAt) => {
    const verdict = await nativeSubscriptionBilling(
      answering(usage(limits({ seven_day: window(12, resetsAt) }))),
      NOW,
    );
    expect(verdict).toMatchObject(blockedWith('native_billing_freshness_unavailable'));
  });

  it('throws a billing error carrying the short reason and the technical detail', async () => {
    const failure = await requireNativeSubscriptionBilling(
      answering(usage(limits({ extra_usage: { is_enabled: true } }))),
    ).catch((cause: unknown) => cause);
    if (!(failure instanceof ClaudeSubscriptionBillingError)) throw new Error('expected a block');
    const notice = CLAUDE_BILLING_NOTICES.native_paid_extra_usage_enabled;
    expect(failure.code).toBe(notice.code);
    expect(failure.message).toBe(claudeBillingReason(notice));
    expect(failure.message.length).toBeLessThanOrEqual(90);
    expect(failure.detail).toContain(notice.detail);
  });
});
