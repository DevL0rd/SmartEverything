import type { SubscriptionUseAuthorizationPort } from './principal';
import { LlmError } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { SUBSCRIPTION_INFERENCE_RESULT } from '@smarteverything/domain';
import type {
  SubscriptionInferenceRequest,
  SubscriptionInferenceResult,
  AiModelRoute,
} from '@smarteverything/domain';
import { SubscriptionAuthorization } from '../authorization/service';
import type { SubscriptionCredential } from '../credentials/contracts';
import type { ProcessSubscriptions } from '../process/subscriptions';
import { SubscriptionRouteAdapter, SUBSCRIPTION_ROUTE } from './adapter';
import { inferenceOptions } from './inference-codec';
import { InferenceImages } from './inference-images';
import { SubscriptionProviderError } from './errors';

const MAX_PENDING_CALLS = 4;
const CALL_TIMEOUT_MS = 15 * 60_000;
const CREDIT_TIMEOUT_MS = 30_000;
class SupplierCall {
  sequence = 0;
  private credit: (() => void) | undefined;
  constructor(
    readonly abort: AbortController,
    readonly timer: ReturnType<typeof setTimeout>,
  ) {}
  advance(): void {
    this.sequence += 1;
  }
  acceptCredit(sequence: number): void {
    if (sequence !== this.sequence || this.credit === undefined)
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Inference credit differs from its outstanding chunk.',
      );
    this.credit();
    this.credit = undefined;
  }
  waitCredit(): Promise<void> {
    return new Promise((resolve, reject) => {
      const failed = (): void => {
        cleanup();
        reject(
          new SubscriptionProviderError(
            'PROVIDER_UNAVAILABLE',
            'Supplier stream cancelled or credit timed out; completion is uncertain.',
          ),
        );
      };
      const timer = setTimeout(() => {
        this.abort.abort('Execution stream stopped consuming.');
      }, CREDIT_TIMEOUT_MS);
      const cleanup = (): void => {
        clearTimeout(timer);
        this.abort.signal.removeEventListener('abort', failed);
      };
      this.credit = (): void => {
        cleanup();
        resolve();
      };
      this.abort.signal.addEventListener('abort', failed, { once: true });
    });
  }
}
class FrozenSupplierAuthorization extends SubscriptionAuthorization {
  override async resolve(routeId: string, signal: AbortSignal): Promise<SubscriptionCredential> {
    signal.throwIfAborted();
    const record = await this.credentials.read(routeId);
    if (record === undefined || record.expires <= Date.now())
      throw new SubscriptionProviderError(
        'AUTH_REQUIRED',
        'Refresh the supplying account status before inference. Model calls cannot refresh or enroll accounts.',
      );
    return record;
  }
}
export class SubscriptionInferenceSupplier {
  private readonly pending = new Map<string, SupplierCall>();
  private stopped = false;
  constructor(
    private readonly hostId: string,
    private readonly subscriptions: ProcessSubscriptions,
  ) {}
  async start(
    id: string,
    request: SubscriptionInferenceRequest,
    send: (result: SubscriptionInferenceResult) => Promise<void>,
  ): Promise<void> {
    if (this.pending.has(id))
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Supplier inference identity is already in use.',
      );
    if (this.stopped || this.pending.size >= MAX_PENDING_CALLS) {
      await send({
        kind: 'failure',
        failure: {
          code: 'AUTH_BUSY',
          message:
            'The model supplier has no available bounded inference slot. No provider request was sent.',
        },
      });
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => {
      abort.abort('Supplier model call exceeded its bounded lifetime.');
    }, CALL_TIMEOUT_MS);
    const call = new SupplierCall(abort, timer);
    this.pending.set(id, call);
    try {
      this.assertRequest(request);
      const adapter = this.adapter(request);
      if (request.kind === 'resolve') {
        const model = await adapter.resolveModel(request.route.id, request.model, abort.signal);
        abort.signal.throwIfAborted();
        await send(SUBSCRIPTION_INFERENCE_RESULT.parse({ kind: 'model', model }));
      } else await this.stream(request, adapter, call, send);
    } catch (cause) {
      await send(
        SUBSCRIPTION_INFERENCE_RESULT.parse({
          kind: 'failure',
          failure: supplierFailure(cause, abort.signal),
        }),
      );
    } finally {
      abort.abort('Supplier call released.');
      clearTimeout(timer);
      this.pending.delete(id);
    }
  }
  credit(id: string, sequence: number): void {
    const call = this.pending.get(id);
    if (call === undefined) return;
    call.acceptCredit(sequence);
  }
  cancel(id: string): void {
    this.pending.get(id)?.abort.abort('Execution host cancelled model inference.');
  }
  stop(): void {
    this.stopped = true;
    for (const call of this.pending.values())
      call.abort.abort('Authenticated supplier channel disconnected.');
  }
  private async stream(
    request: Extract<SubscriptionInferenceRequest, { kind: 'stream' }>,
    adapter: SubscriptionRouteAdapter,
    call: SupplierCall,
    send: (result: SubscriptionInferenceResult) => Promise<void>,
  ): Promise<void> {
    let terminal = false;
    for await (const chunk of adapter.stream({
      ...inferenceOptions(request.options, call.abort.signal),
      sessionId: SessionId(request.claim.session_id),
    })) {
      call.abort.signal.throwIfAborted();
      terminal = chunk.type === 'finish';
      const result = SUBSCRIPTION_INFERENCE_RESULT.parse({
        kind: 'chunk',
        sequence: call.sequence,
        chunk,
      });
      const credit = terminal ? undefined : call.waitCredit();
      await Promise.all([Promise.resolve().then(() => send(result)), credit]);
      if (terminal) break;
      call.advance();
    }
    if (!terminal)
      throw new LlmError(
        'Native model stream ended without a terminal outcome; completion is uncertain.',
        'INCOMPLETE_STREAM',
      );
  }
  private assertRequest(request: SubscriptionInferenceRequest): void {
    const route = request.route;
    if (
      route.supplier.kind !== 'device' ||
      route.supplier.device_id !== this.hostId ||
      route.billing !== 'subscription-only' ||
      route.state !== 'ready' ||
      route.subscriber_id !== route.profile_id ||
      route.credential_generation === undefined
    )
      throw new SubscriptionProviderError(
        'AUTH_DENIED',
        'Inference request differs from this supplier account binding.',
      );
    const selected = this.subscriptions.inferenceRoute(route.id);
    if (JSON.stringify(selected) !== JSON.stringify(route))
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Published supplier account changed before inference admission.',
      );
    if (request.kind === 'stream') admitSupplierStream(request);
  }

  private adapter(request: SubscriptionInferenceRequest): SubscriptionRouteAdapter {
    const route = request.route;
    const images = new InferenceImages(request.kind === 'stream' ? request.images : []);
    return new SubscriptionRouteAdapter({
      routes: [
        SUBSCRIPTION_ROUTE.parse({
          id: route.id,
          subscriberProfileId: route.profile_id,
          credentialGeneration: route.credential_generation,
          capabilityRevision: route.capability_revision,
          kind: subscriptionKind(route),
        }),
      ],
      authorization: new FrozenSupplierAuthorization(this.subscriptions.authorization.credentials),
      admission: this.subscriptions.admission,
      fetcher: this.subscriptions.inferenceFetch(),
      attachments: {
        resolveAttachments: () => images,
        resolveImageAccess: (_store, ref) => images.access(ref),
      },
      useAuthorization: {
        principal: (): ReturnType<SubscriptionUseAuthorizationPort['principal']> => {
          if (request.kind !== 'stream')
            throw new SubscriptionProviderError(
              'AUTH_DENIED',
              'Model discovery has no execution grant.',
            );
          return Promise.resolve({
            profileId: route.profile_id,
            source: 'interactive',
            authorizationId: request.claim.token,
            sessionId: request.claim.session_id,
          });
        },
        authorize: (input): Promise<boolean> =>
          Promise.resolve(
            request.kind === 'stream' &&
              input.routeId === route.id &&
              input.model === request.options.model &&
              input.capabilityRevision === route.capability_revision &&
              input.subscriberProfileId === route.profile_id &&
              input.supplierHostId === this.hostId &&
              input.credentialGeneration === route.credential_generation &&
              input.principal.authorizationId === request.claim.token,
          ),
      },
    });
  }
}
function subscriptionKind(route: AiModelRoute): string {
  if (route.auth.provider === 'anthropic') return 'claude-subscription';
  if (route.auth.kind === 'chatgpt-codex-oauth') return 'codex-subscription';
  return 'chatgpt-subscription';
}

function admitSupplierStream(
  request: Extract<SubscriptionInferenceRequest, { kind: 'stream' }>,
): void {
  if (
    (request.claim.target.kind !== 'server' &&
      (request.claim.target.device_id !== request.execution?.device_id ||
        request.claim.runtime_instance !== request.execution.runtime_instance ||
        request.claim.connection_generation !== request.execution.generation)) ||
    request.claim.session_id !== request.options.sessionId ||
    request.route.id !== request.options.provider ||
    !request.route.models.some((model) => model.id === request.options.model)
  )
    throw new SubscriptionProviderError(
      'AUTH_DENIED',
      'Only centrally admitted execution model calls may use this remote supplier.',
    );
}
function supplierFailure(
  cause: unknown,
  signal: AbortSignal,
): Extract<SubscriptionInferenceResult, { kind: 'failure' }>['failure'] {
  if (signal.aborted)
    return {
      code: 'SUPPLIER_CANCELLED',
      message: 'Supplier model call was cancelled or timed out; completion is uncertain.',
    };
  if (cause instanceof LlmError)
    return {
      ...cause.failure,
      message:
        'Supplier inference was refused or failed. Refresh the exact account route; no fallback was attempted.',
    };
  return {
    code: 'SUPPLIER_INFERENCE_FAILED',
    message:
      'Supplier inference failed before a truthful terminal outcome; completion is uncertain.',
  };
}
