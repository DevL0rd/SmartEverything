import { LlmError } from '@deepseek-ai/dsh-llm';

export type SubscriptionFailure =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'AUTH_DENIED'
  | 'AUTH_BUSY'
  | 'STORAGE_FAILED'
  | 'MODEL_UNAVAILABLE'
  | 'CAPABILITY_UNAVAILABLE'
  | 'PLAN_ONLY_UNVERIFIED'
  | 'PROVIDER_UNAVAILABLE'
  | 'QUOTA_EXCEEDED';

export class SubscriptionProviderError extends LlmError {
  constructor(
    readonly reason: SubscriptionFailure,
    message: string,
    readonly providerStatus?: number,
  ) {
    super(message, reason, providerStatus === undefined ? undefined : { status: providerStatus });
    this.name = 'SubscriptionProviderError';
  }
}
