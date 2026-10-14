import { z } from 'zod';
import { ProviderRequestId } from '@deepseek-ai/dsh-llm';
import type { LlmFailure } from '@deepseek-ai/dsh-llm';

export class SubscriptionInferenceTransport {
  private observed: Pick<LlmFailure, 'status' | 'requestId'> | undefined;
  readonly fetch: typeof fetch;

  constructor(fetcher: typeof fetch, beforeDispatch?: () => Promise<void>) {
    this.fetch = async (input, init): Promise<Response> => {
      if (beforeDispatch !== undefined) await beforeDispatch();
      const response = await fetcher(input, { ...init, redirect: 'error' });
      const requestId =
        response.headers.get('openai-request-id') ??
        response.headers.get('x-request-id') ??
        response.headers.get('request-id');
      this.observed = {
        status: response.status,
        ...(requestId === null
          ? {}
          : { requestId: ProviderRequestId(z.string().min(1).max(1000).parse(requestId)) }),
      };
      return response;
    };
  }

  failureFacts(): Pick<LlmFailure, 'status' | 'requestId'> {
    return this.observed ?? {};
  }
}
