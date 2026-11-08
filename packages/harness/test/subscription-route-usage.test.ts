import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { HarnessSubscriptionRequest } from '@smarteverything/domain';
import type { ClaudeSubscriptionCredential } from '../src/credentials/contracts';
import type { HarnessBoot } from '../src/process/boot';
import { subscriptionStatus } from '../src/process/subscription-status';
import { SubscriptionBillingAdmission } from '../src/providers/billing';

const BOOT: HarnessBoot = {
  type: 'harness_boot',
  protocol: 1,
  device_id: randomUUID(),
  generation: randomUUID(),
  runtime_instance: randomUUID(),
  name: 'test',
  hub_url: 'https://hub.test',
  token: 'test-token',
  home_directory: '/home/test',
  state_directory: '/home/test/state',
  platform: 'linux',
  permission: { sandbox: 'danger-full-access', approval: 'never' },
};
const REQUEST: HarnessSubscriptionRequest = {
  profile_id: randomUUID(),
  route_id: randomUUID(),
  provider: 'claude',
  command: { kind: 'status' },
};
const IDENTITY = { accountId: randomUUID(), organizationId: randomUUID() };
const CREDENTIAL: ClaudeSubscriptionCredential = {
  kind: 'claude-subscription',
  routeId: REQUEST.route_id,
  hostId: BOOT.device_id,
  generation: randomUUID(),
  access: 'sk-ant-oat01-test',
  refresh: 'test-refresh',
  expires: Date.now() + 60_000,
  subscriberProfileId: REQUEST.profile_id,
  identity: IDENTITY,
};
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile';
const RESET = '2033-05-18T03:33:20.000Z';

function answering(calls: string[]): SubscriptionBillingAdmission {
  return new SubscriptionBillingAdmission((url) => {
    const address = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    calls.push(address);
    if (address === PROFILE_URL) {
      return Promise.resolve(
        Response.json({
          account: { uuid: IDENTITY.accountId },
          organization: { uuid: IDENTITY.organizationId },
        }),
      );
    }
    if (address === USAGE_URL) {
      return Promise.resolve(
        Response.json({
          extra_usage: { is_enabled: false },
          five_hour: { utilization: 13, resets_at: 'unreported' },
          seven_day: { utilization: 42, resets_at: RESET },
        }),
      );
    }
    throw new Error(`Unexpected request: ${address}`);
  });
}

it('advertises only the normalized Claude allowance from existing authenticated status requests', async () => {
  const calls: string[] = [];
  const billing = await answering(calls).inspect(CREDENTIAL, new AbortController().signal);
  expect(billing.state).toBe('disabled');
  expect(calls).toEqual([PROFILE_URL, USAGE_URL, PROFILE_URL]);

  const status = subscriptionStatus({
    boot: BOOT,
    request: REQUEST,
    state: 'ready',
    message: billing.message,
    credential: CREDENTIAL,
    billing,
  });
  expect(status.route.usage).toEqual({
    runtime: 'claude',
    reported_at: billing.usage?.reported_at,
    status: 'reported',
    windows: [
      {
        id: 'five_hour',
        label: '5-hour window',
        used_percent: 13,
        resets_at: null,
        window_duration_mins: 300,
      },
      {
        id: 'seven_day',
        label: 'Weekly window',
        used_percent: 42,
        resets_at: RESET,
        window_duration_mins: 10_080,
      },
    ],
  });
});
