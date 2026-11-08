import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CodexSubscriptionCredential } from '../src/credentials/contracts';
import { assertPlanOnlyAdmission } from '../src/providers/admission';
import { SubscriptionBillingAdmission } from '../src/providers/billing';

const ACCOUNT = 'account';
const USER = 'user';
const CREDITS = { has_credits: true, unlimited: true, balance: '10.5' };
const OPEN_LIMIT = { allowed: true, limit_reached: false, primary_window: { used_percent: 100 } };

function credential(): CodexSubscriptionCredential {
  const claims = Buffer.from(
    JSON.stringify({
      'https://api.openai.com/auth': { chatgpt_account_id: ACCOUNT, chatgpt_user_id: USER },
    }),
  ).toString('base64url');
  return {
    kind: 'codex-subscription',
    routeId: 'codex-sub',
    hostId: randomUUID(),
    generation: randomUUID(),
    access: `e30.${claims}.signature`,
    refresh: 'test-refresh',
    expires: Date.now() + 60_000,
    accountId: ACCOUNT,
    identityCandidate: { accountId: ACCOUNT, userId: USER },
  };
}

function usage(overrides: Readonly<Record<string, unknown>>): SubscriptionBillingAdmission {
  return new SubscriptionBillingAdmission(() =>
    Promise.resolve(
      Response.json({
        account_id: ACCOUNT,
        user_id: USER,
        rate_limit: OPEN_LIMIT,
        spend_control: { reached: false, individual_limit: { remaining_percent: 0 } },
        ...overrides,
      }),
    ),
  );
}

describe('managed Codex subscription admission', () => {
  it.each([{ credits: CREDITS }, {}])(
    'verifies affirmative usage with a full window and usage fields %j',
    async (fields) => {
      const account = credential();
      const admission = usage(fields);
      const { signal } = new AbortController();
      await expect(admission.inspect(account, signal)).resolves.toMatchObject({
        state: 'disabled',
        usage: {
          runtime: 'codex',
          windows: [
            { id: 'primary', used_percent: 100, window_duration_mins: null, resets_at: null },
          ],
        },
      });
      await expect(assertPlanOnlyAdmission(admission, account, signal)).resolves.toMatchObject({
        state: 'verified',
        codexProof: { identityCandidate: account.identityCandidate },
      });
    },
  );

  it('reports Codex ordinary usage windows and their provider reset times', async () => {
    const admission = usage({
      rate_limit: {
        ...OPEN_LIMIT,
        primary_window: { used_percent: 24, limit_window_seconds: 18_000 },
        secondary_window: {
          used_percent: 41,
          limit_window_seconds: 604_800,
          reset_at: 2_000_000_000,
        },
      },
    });
    await expect(
      admission.inspect(credential(), new AbortController().signal),
    ).resolves.toMatchObject({
      usage: {
        windows: [
          { id: 'primary', used_percent: 24, window_duration_mins: 300, resets_at: null },
          {
            id: 'secondary',
            used_percent: 41,
            window_duration_mins: 10_080,
            resets_at: '2033-05-18T03:33:20.000Z',
          },
        ],
      },
    });
  });

  it('keeps admission independent of missing or invalid display windows', async () => {
    const admission = usage({
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: { used_percent: -1 },
        secondary_window: null,
      },
    });
    const snapshot = await admission.inspect(credential(), new AbortController().signal);
    expect(snapshot.state).toBe('disabled');
    expect(snapshot.usage).toBeUndefined();
  });

  it.each([
    { rate_limit: { ...OPEN_LIMIT, allowed: false } },
    { rate_limit: { ...OPEN_LIMIT, limit_reached: true } },
    { spend_control: { reached: true } },
    { rate_limit_reached_type: { type: 'workspace_member_credits_depleted' } },
  ])('rejects authoritative provider restrictions despite credits %j', async (restriction) => {
    const account = credential();
    const admission = usage({ credits: CREDITS, ...restriction });
    const { signal } = new AbortController();
    await expect(admission.inspect(account, signal)).resolves.toMatchObject({
      state: 'quota_exhausted',
    });
    await expect(assertPlanOnlyAdmission(admission, account, signal)).rejects.toThrow(
      'Codex reports that usage is exhausted or restricted for this account.',
    );
  });

  it.each([{ user_id: 'other-user' }, { account_id: 'other-account' }])(
    'rejects usage belonging to a different identity %j',
    async (fields) => {
      const account = credential();
      const admission = usage({ credits: CREDITS, ...fields });
      const { signal } = new AbortController();
      await expect(assertPlanOnlyAdmission(admission, account, signal)).rejects.toMatchObject({
        code: 'PLAN_ONLY_UNVERIFIED',
      });
    },
  );
});
