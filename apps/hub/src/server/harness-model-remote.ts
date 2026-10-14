import { randomUUID } from 'node:crypto';
import {
  ApiError,
  HUB_HARNESS_CONTROL,
  SUBSCRIPTION_INFERENCE_MAX_BYTES,
} from '@smarteverything/domain';
import type {
  HubHarnessControl,
  NodeHarnessFrame,
  SubscriptionInferenceRequest,
  SubscriptionInferenceResult,
} from '@smarteverything/domain';
import type { SubscriptionInferencePort } from '@smarteverything/harness';

const MAX_PENDING = 4;
const CALL_TIMEOUT_MS = 15 * 60_000;
class PendingInference {
  result: SubscriptionInferenceResult | undefined;
  error: Error | undefined;
  wake: (() => void) | undefined;
  sequence = 0;
  terminal = false;
  cancelSent = false;
  private released = false;
  constructor(
    readonly request: SubscriptionInferenceRequest,
    readonly abort: AbortController,
    readonly timer: NodeJS.Timeout,
  ) {}
  advance(): void {
    this.sequence += 1;
  }
  markCancelled(): void {
    this.cancelSent = true;
  }
  release(): boolean {
    if (this.released) return false;
    this.released = true;
    clearTimeout(this.timer);
    this.result = undefined;
    this.wake = undefined;
    return true;
  }
  assertActive(): void {
    if (this.error !== undefined) throw this.error;
    if (this.released)
      throw new ApiError('conflict', 'Supplier inference resources have been released.');
  }
  async take(): Promise<SubscriptionInferenceResult> {
    this.assertActive();
    if (this.result === undefined && this.error === undefined)
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    this.wake = undefined;
    this.assertActive();
    const result = this.result;
    if (result === undefined)
      throw new ApiError('internal', 'Supplier stream woke without a result.');
    this.result = undefined;
    return result;
  }
  accept(result: SubscriptionInferenceResult): void {
    this.assertFlow(result);
    if (this.request.kind === 'resolve' && result.kind === 'chunk')
      throw new ApiError('forbidden', 'Discovery returned a model stream.');
    if (this.request.kind === 'stream' && result.kind === 'model')
      throw new ApiError('forbidden', 'Inference returned model discovery.');
    this.terminal = result.kind !== 'chunk' || result.chunk.type === 'finish';
    this.result = result;
    this.wake?.();
  }
  private assertFlow(result: SubscriptionInferenceResult): void {
    if (
      this.terminal ||
      this.result !== undefined ||
      (result.kind === 'chunk' && result.sequence !== this.sequence)
    )
      throw new ApiError(
        'forbidden',
        'Supplier exceeded stream credit or changed its chunk sequence.',
      );
  }
}
export class RemoteHarnessModels implements SubscriptionInferencePort {
  private readonly pending = new Map<string, PendingInference>();
  private stopped = false;
  private readonly retired = new Set<string>();
  constructor(
    private readonly binding: {
      readonly device_id: string;
      readonly generation: string;
      readonly runtime_instance: string;
    },
    private readonly ports: {
      readonly send: (frame: HubHarnessControl) => void;
      readonly admit: (request: SubscriptionInferenceRequest) => void;
      readonly authenticate: () => void;
      readonly terminate: () => void;
    },
  ) {}
  async *call(
    request: SubscriptionInferenceRequest,
    signal: AbortSignal,
  ): AsyncIterable<SubscriptionInferenceResult> {
    signal.throwIfAborted();
    if (this.stopped || this.pending.size >= MAX_PENDING)
      throw new ApiError(
        'conflict',
        'Subscription inference supplier is offline or at its bounded call limit.',
      );
    this.admit(request);
    const id = randomUUID();
    const abort = new AbortController();
    const timer = setTimeout(() => {
      abort.abort('Supplier model call timed out; completion is uncertain.');
    }, CALL_TIMEOUT_MS);
    timer.unref();
    const pending = new PendingInference(request, abort, timer);
    const cancelled = (): void => {
      pending.error ??= new ApiError(
        'conflict',
        'Supplier model call cancelled or disconnected; completion is uncertain.',
      );
      pending.wake?.();
      this.cancel(id, pending);
      release();
    };
    const callerCancelled = (): void => {
      abort.abort(signal.reason);
    };
    const release = (): void => {
      if (!pending.release()) return;
      signal.removeEventListener('abort', callerCancelled);
      abort.signal.removeEventListener('abort', cancelled);
      this.pending.delete(id);
      this.retire(id);
    };
    abort.signal.addEventListener('abort', cancelled, { once: true });
    signal.addEventListener('abort', callerCancelled, { once: true });
    this.pending.set(id, pending);
    try {
      signal.throwIfAborted();
      this.send({ ...this.binding, type: 'harness_subscription_inference', id, request });
      yield* this.results(id, pending);
    } finally {
      this.cancel(id, pending);
      release();
    }
  }
  private async *results(
    id: string,
    pending: PendingInference,
  ): AsyncIterable<SubscriptionInferenceResult> {
    for (;;) {
      const result = await pending.take();
      this.admit(pending.request);
      yield result;
      if (result.kind !== 'chunk' || result.chunk.type === 'finish') return;
      pending.assertActive();
      if (!pending.terminal) {
        this.admit(pending.request);
        this.send({
          ...this.binding,
          type: 'harness_subscription_inference_credit',
          id,
          sequence: pending.sequence,
        });
        pending.advance();
      }
    }
  }
  receive(
    frame: Extract<NodeHarnessFrame, { type: 'harness_subscription_inference_result' }>,
  ): void {
    const pending = this.pending.get(frame.id);
    if (pending === undefined) {
      if (this.retired.has(frame.id)) return;
      throw new ApiError('forbidden', 'Supplier result has no dispatched inference request.');
    }
    if (pending.abort.signal.aborted) return;
    this.admit(pending.request);
    pending.accept(frame.result);
  }

  revalidate(): void {
    for (const pending of this.pending.values()) {
      try {
        this.admit(pending.request);
      } catch (cause) {
        pending.error =
          cause instanceof Error
            ? cause
            : new ApiError('forbidden', 'Supplier inference authority changed.');
        pending.abort.abort();
      }
    }
  }
  stop(): void {
    this.stopped = true;
    for (const pending of this.pending.values())
      pending.abort.abort('Authenticated supplier connection lost.');
  }
  private cancel(id: string, pending: PendingInference): void {
    if (pending.terminal || pending.cancelSent || !this.active()) return;
    pending.markCancelled();
    try {
      this.send({ ...this.binding, type: 'harness_subscription_inference_cancel', id });
    } catch (cause) {
      this.ports.terminate();
      pending.abort.abort(cause);
    }
  }
  private active(): boolean {
    return !this.stopped;
  }
  private retire(id: string): void {
    this.retired.add(id);
    if (this.retired.size > 256) {
      const oldest = this.retired.values().next().value;
      if (oldest !== undefined) this.retired.delete(oldest);
    }
  }
  private admit(request: SubscriptionInferenceRequest): void {
    this.ports.authenticate();
    this.ports.admit(request);
  }
  private send(frame: HubHarnessControl): void {
    const parsed = HUB_HARNESS_CONTROL.parse(frame);
    if (Buffer.byteLength(JSON.stringify(parsed)) > SUBSCRIPTION_INFERENCE_MAX_BYTES)
      throw new ApiError('invalid_request', 'Supplier model call exceeds its bounded frame size.');
    this.ports.send(parsed);
  }
}
