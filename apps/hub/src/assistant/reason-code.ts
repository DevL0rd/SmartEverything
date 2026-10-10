import type { AssistantReasonCode } from '@smarteverything/domain';
import { OpenRouterError, type OpenRouterErrorCode } from '../openrouter/errors';

const BY_OPENROUTER_CODE: Readonly<Partial<Record<OpenRouterErrorCode, AssistantReasonCode>>> = {
  no_credits: 'credits',
  rate_limited: 'rate_limit',
  unavailable: 'model_unavailable',
  not_found: 'model_unavailable',
};

export function reasonCodeOf(cause: unknown, stopped: boolean): AssistantReasonCode {
  if (stopped) {
    return 'stopped';
  }
  if (cause instanceof OpenRouterError) {
    return BY_OPENROUTER_CODE[cause.code] ?? 'unknown';
  }
  return 'unknown';
}
