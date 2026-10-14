import type {
  AiSubscriptionHostStatus,
  AiSubscriptionProvider,
  AiHarnessHost,
  AiSubscriptionInteraction,
} from '@smarteverything/domain';
export const SUBSCRIPTION_LABELS: Readonly<Record<AiSubscriptionHostStatus['state'], string>> = {
  missing_login: 'Sign in',
  authorizing: 'Finish sign-in',
  ready: 'Ready',
  missing_scope: 'Sign in again',
  billing_unavailable: 'Subscription billing unavailable',
  paid_usage_enabled: 'Paid usage is enabled',
  quota_exhausted: 'Subscription limit reached',
  unsupported_model: 'Model unavailable',
  failed: 'Sign-in failed',
};
export function subscriptionTitle(provider: AiSubscriptionProvider): string {
  return provider === 'claude'
    ? 'Claude subscription'
    : provider === 'chatgpt-codex'
      ? 'Codex subscription'
      : 'ChatGPT sign-in';
}
export function subscriptionUnavailable(
  host: AiHarnessHost | undefined,
  live: boolean,
): string | null {
  if (!live) return 'Reconnect to the hub to manage this subscription.';
  if (host === undefined)
    return 'Update this computer’s background runtime to use subscription sign-in.';
  if (!host.online) return 'Reconnect this computer.';
  if (host.platform !== 'linux' && host.platform !== 'macos')
    return 'Subscription sign-in is not available on this host.';
  if (host.manifest === null) return 'Update this computer’s background runtime.';
  return null;
}
export interface SubscriptionSummary {
  readonly state: AiSubscriptionHostStatus['state'];
  readonly message: string;
}
export function subscriptionSummary(status: AiSubscriptionHostStatus): SubscriptionSummary {
  return {
    state: status.state,
    message: status.message,
  };
}

export function subscriptionInteractionIdentity(
  interaction: AiSubscriptionInteraction | null,
): string | null {
  return interaction === null ? null : JSON.stringify(interaction);
}
