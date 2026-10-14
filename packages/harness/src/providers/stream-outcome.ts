import { QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import type { StreamChunk, LlmFailure } from '@deepseek-ai/dsh-llm';

export function subscriptionStreamOutcome(
  chunk: StreamChunk,
  facts: Pick<LlmFailure, 'status' | 'requestId'>,
): StreamChunk {
  if (chunk.type !== 'finish' || chunk.reason.kind !== 'error') return chunk;
  const quota = chunk.reason.failure.message.includes('subscription_sharing_usage_limit_exceeded');
  return {
    ...chunk,
    reason: {
      ...chunk.reason,
      failure: {
        ...chunk.reason.failure,
        ...facts,
        ...(quota ? { code: QUOTA_EXCEEDED_CODE } : {}),
      },
    },
  };
}
