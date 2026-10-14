import {
  SUBSCRIPTION_CONSUMER_REQUEST,
  SUBSCRIPTION_INFERENCE_RESULT,
  SUBSCRIPTION_INFERENCE_MAX_BYTES,
} from '@smarteverything/domain';
import type {
  AiModelRoute,
  DshWriterClaim,
  SubscriptionInferenceRequest,
  SubscriptionInferenceResult,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import type { SubscriptionInferencePort } from '../providers/remote-adapter';
import { HarnessRuntimeError } from '../host/errors';
import type { HarnessBoot } from './boot';
import type { HarnessControlPersistence } from './contracts';
import { connectionDiagnosticFetch } from './connection-diagnostics';

export class HttpSubscriptionModels implements SubscriptionInferencePort {
  constructor(
    private readonly boot: HarnessBoot,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async *call(
    request: SubscriptionInferenceRequest,
    signal: AbortSignal,
  ): AsyncIterable<SubscriptionInferenceResult> {
    signal.throwIfAborted();
    const abort = new AbortController();
    const combined = AbortSignal.any([signal, abort.signal]);
    try {
      const response = await this.response(request, combined);
      if (!response.ok || response.body === null)
        throw new HarnessRuntimeError(
          response.status === 403 || response.status === 409
            ? 'ownership_lost'
            : 'route_unavailable',
          `The subscription relay refused this exact execution model call (HTTP ${String(response.status)}); no fallback is available.`,
        );
      let sequence = 0;
      for await (const result of readResults(response.body, combined)) {
        if (result.kind === 'chunk' && result.sequence !== sequence++)
          throw new HarnessRuntimeError(
            'source_outcome_unknown',
            'Subscription relay changed its chunk sequence.',
          );
        yield result;
        if (result.kind !== 'chunk' || result.chunk.type === 'finish') return;
      }
      throw new HarnessRuntimeError(
        'source_outcome_unknown',
        'Subscription relay ended without a terminal outcome; completion is uncertain.',
      );
    } finally {
      abort.abort('Execution model call released.');
    }
  }
  private response(request: SubscriptionInferenceRequest, signal: AbortSignal): Promise<Response> {
    const execution = {
      platform: this.boot.platform,
      device_id: this.boot.device_id,
      generation: this.boot.generation,
      runtime_instance: this.boot.runtime_instance,
    };
    const body = SUBSCRIPTION_CONSUMER_REQUEST.parse({
      device_id: this.boot.device_id,
      generation: this.boot.generation,
      runtime_instance: this.boot.runtime_instance,
      request: request.kind === 'resolve' ? request : { ...request, execution },
    });
    return connectionDiagnosticFetch('harness_hub', this.fetcher)(
      new URL('/api/ai/harness/subscription-inference', this.boot.hub_url),
      {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: { authorization: `Bearer ${this.boot.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
  }
}
async function* readResults(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncIterable<SubscriptionInferenceResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffered = '';
  const cancel = (): void => {
    buffered = '';
    void reader.cancel(signal.reason).catch((cause: unknown): void => {
      new Logger('hub.harness').warn('model_stream.cancel_failed', {
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
    });
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const value = await reader.read();
      buffered += decoder.decode(value.value, { stream: !value.done });
      let boundary = buffered.indexOf('\n');
      while (boundary !== -1) {
        const line = buffered.slice(0, boundary);
        assertSize(line);
        buffered = buffered.slice(boundary + 1);
        yield SUBSCRIPTION_INFERENCE_RESULT.parse(JSON.parse(line));
        signal.throwIfAborted();
        boundary = buffered.indexOf('\n');
      }
      assertSize(buffered);
      if (value.done) {
        if (buffered !== '')
          throw new HarnessRuntimeError(
            'source_outcome_unknown',
            'Subscription relay ended inside a model frame.',
          );
        return;
      }
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
function assertSize(value: string): void {
  if (Buffer.byteLength(value) > SUBSCRIPTION_INFERENCE_MAX_BYTES)
    throw new HarnessRuntimeError(
      'source_outcome_unknown',
      'Subscription relay exceeded the bounded model frame size.',
    );
}
export async function authorizeConsumerSupplier(
  persistence: HarnessControlPersistence,
  route: AiModelRoute,
  options: GenerateOptions,
): Promise<DshWriterClaim> {
  if (options.sessionId === undefined)
    throw new HarnessRuntimeError(
      'ownership_lost',
      'Model inference requires its owned native conversation.',
    );
  if (route.credential_generation === undefined)
    throw new HarnessRuntimeError(
      'route_unavailable',
      'The selected subscription route has no admitted account generation.',
    );
  const claim = persistence.claim(options.sessionId);
  await persistence.verify(claim, {
    route_id: route.id,
    model: options.model,
    capability_revision: route.capability_revision,
    credential_generation: route.credential_generation,
  });
  return claim;
}
