import { HarnessRuntimeError, SubscriptionProviderError } from '@smarteverything/harness';
import { z } from 'zod';

const SUBSCRIPTION_FAILURE_REASON = z.enum([
  'AUTH_REQUIRED',
  'AUTH_INVALID',
  'AUTH_DENIED',
  'AUTH_BUSY',
  'STORAGE_FAILED',
  'MODEL_UNAVAILABLE',
  'CAPABILITY_UNAVAILABLE',
  'PLAN_ONLY_UNVERIFIED',
  'PROVIDER_UNAVAILABLE',
  'QUOTA_EXCEEDED',
]);

export function subscriptionFailureCategory(cause: Error): string {
  if (cause instanceof SubscriptionProviderError) {
    const reason = SUBSCRIPTION_FAILURE_REASON.safeParse(cause.reason);
    return reason.success ? reason.data : 'subscription_unknown';
  }
  if (cause instanceof z.ZodError) return 'schema';
  if (cause instanceof HarnessRuntimeError) return 'runtime';
  return 'unexpected';
}
