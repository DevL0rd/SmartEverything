import { randomUUID } from 'node:crypto';
import {
  ApiError,
  COMPUTER_RUNTIME_REPLY,
  type ComputerAiRuntime,
  type ComputerRuntimeRead,
  type ComputerRuntimeExecute,
  type ComputerRuntimeRequest,
  type ComputerRuntimeReply,
  type NodeAiFrameV2,
  type HubAiControlV2,
} from '@smarteverything/domain';
import type { ComputerRuntimeHost, ComputerRuntimeHostEvent } from './runtime-host';
import { isNativeOperation } from '../claude/native-operations';

const TIMEOUT_MS = 30_000;
interface Pending {
  readonly request: ComputerRuntimeRequest;
  readonly resolve: (reply: ComputerRuntimeReply) => void;
  readonly reject: (cause: ApiError) => void;
  readonly timer: NodeJS.Timeout;
}
export class RemoteComputerRuntimeHost implements ComputerRuntimeHost {
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Set<(event: ComputerRuntimeHostEvent) => void>();
  private closed = false;
  constructor(
    readonly runtime: ComputerAiRuntime,
    readonly deviceId: string,
    readonly generation: string,
    private readonly send: (frame: HubAiControlV2) => void,
  ) {}
  read(request: ComputerRuntimeRead): Promise<ComputerRuntimeReply> {
    return this.call(request);
  }
  execute(request: ComputerRuntimeExecute): Promise<ComputerRuntimeReply> {
    return this.call(request);
  }
  onEvent(listener: (event: ComputerRuntimeHostEvent) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }
  receive(frame: Exclude<NodeAiFrameV2, { type: 'hello' }>): void {
    if (frame.device_id !== this.deviceId || frame.generation !== this.generation)
      throw new ApiError(
        'forbidden',
        'Runtime frame belongs to another device or connection generation.',
      );
    if (this.closed) return;
    switch (frame.type) {
      case 'reply':
        this.settle(frame);
        return;
      case 'capabilities':
        this.capabilities(frame);
        return;
      case 'provider_event':
        if (frame.payload.runtime === this.runtime)
          this.emit({ kind: 'provider', ...frame.payload });
        return;
      case 'native_event':
        if (frame.payload.runtime === this.runtime) this.emit({ kind: 'native', ...frame.payload });
        return;
    }
  }
  private capabilities(frame: Extract<NodeAiFrameV2, { type: 'capabilities' }>): void {
    if (frame.runtime === this.runtime)
      this.emit({ kind: 'capabilities', runtime: frame.runtime, capabilities: frame.capabilities });
  }
  stop(): void {
    if (this.closed) return;
    this.closed = true;
    for (const [id] of this.pending)
      this.failed(
        id,
        'The computer runtime disconnected before confirming the request; it was not resubmitted.',
      );
    this.listeners.clear();
  }
  private call(request: ComputerRuntimeRequest): Promise<ComputerRuntimeReply> {
    if (request.runtime !== this.runtime)
      return Promise.reject(
        new ApiError('invalid_request', 'Runtime request and remote host must agree.'),
      );
    if (this.closed)
      return Promise.reject(
        new ApiError('claude_not_ready', 'Selected computer runtime is offline.'),
      );
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.failed(
          id,
          'The computer did not confirm this request in time; inspect its receipt before another mutation.',
        );
      }, TIMEOUT_MS);
      this.pending.set(id, { request, resolve, reject, timer });
      try {
        this.send({
          type: 'request',
          device_id: this.deviceId,
          generation: this.generation,
          id,
          request,
        });
      } catch (cause) {
        this.failed(
          id,
          cause instanceof Error
            ? `Request delivery failed: ${cause.message}; it was not resubmitted.`
            : 'Request delivery failed with an unknown transport error; it was not resubmitted.',
        );
      }
    });
  }
  private failed(id: string, message: string): void {
    const pending = this.pending.get(id);
    if (pending === undefined) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    const reply = uncertain(pending.request, message);
    if (reply === null) pending.reject(new ApiError('claude_not_ready', message));
    else pending.resolve(reply);
  }
  private settle(frame: Extract<NodeAiFrameV2, { type: 'reply' }>): void {
    const pending = this.pending.get(frame.id);
    if (pending === undefined) return;
    this.pending.delete(frame.id);
    clearTimeout(pending.timer);
    if (!frame.result.ok) {
      pending.reject(new ApiError('upstream_failed', frame.result.failure.message));
      return;
    }
    const reply = COMPUTER_RUNTIME_REPLY.parse(frame.result.reply);
    if (
      reply.runtime !== this.runtime ||
      reply.reply.operation !== pending.request.request.operation
    ) {
      pending.reject(
        new ApiError('upstream_failed', 'The computer returned a different runtime or operation.'),
      );
      return;
    }
    pending.resolve(reply);
  }
  private emit(event: ComputerRuntimeHostEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
function uncertain(request: ComputerRuntimeRequest, error: string): ComputerRuntimeReply | null {
  if (
    !('operation_id' in request.request) ||
    request.request.operation_id === undefined ||
    request.request.operation === 'native_operation'
  )
    return null;
  if (request.runtime === 'claude') {
    if (!isNativeOperation(request.request)) return null;
    return {
      runtime: 'claude',
      reply: {
        operation: request.request.operation,
        value: {
          native_operation: {
            id: request.request.operation_id,
            operation: request.request.operation,
            state: 'uncertain',
            value: null,
            error,
          },
        },
      },
    };
  }
  return COMPUTER_RUNTIME_REPLY.parse({
    runtime: 'codex',
    reply: {
      operation: request.request.operation,
      value: {
        native_operation: {
          id: request.request.operation_id,
          operation: request.request.operation,
          state: 'uncertain',
          value: null,
          error,
        },
      },
    },
  });
}
