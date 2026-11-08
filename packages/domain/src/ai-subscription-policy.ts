export interface SubscriptionQuotaPolicy {
  readonly allowed: boolean;
  readonly restricted: boolean;
}

export function subscriptionQuotaExhausted(quotas: readonly SubscriptionQuotaPolicy[]): boolean {
  return quotas.some((quota) => !quota.allowed || quota.restricted);
}
