import { randomUUID } from 'node:crypto';
import {
  ApiError,
  COMPUTER_AI_REPLY,
  type ComputerAiExecute,
  type ComputerAiRead,
  type ComputerAiReply,
  type HubAiControl,
  type NodeAiFrame,
} from '@smarteverything/domain';
import type { ComputerAiHost, ComputerAiHostEvent } from './ai-host';
import { isNativeOperation, type NativeOperationRequest } from '../claude/native-operations';

const CALL_TIMEOUT_MS = 30_000;
interface Pending {
  readonly operation: string;
  readonly native: NativeOperationRequest | null;
  readonly id: string;
  readonly resolve: (reply: ComputerAiReply) => void;
  readonly reject: (cause: ApiError) => void;
  readonly timer: NodeJS.Timeout;
}
export class RemoteComputerAiHost implements ComputerAiHost {
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Set<(event: ComputerAiHostEvent) => void>();
  private closed = false;

  constructor(
    readonly deviceId: string,
    readonly generation: string,
    private readonly send: (frame: HubAiControl) => void,
    private readonly close: () => void,
  ) {}

  read(request: ComputerAiRead): Promise<ComputerAiReply> {
    return this.call(request);
  }
  execute(request: ComputerAiExecute): Promise<ComputerAiReply> {
    return this.call(
      isNativeOperation(request)
        ? { ...request, operation_id: request.operation_id ?? randomUUID() }
        : request,
    );
  }

  receive(frame: Exclude<NodeAiFrame, { type: 'hello' }>): void {
    if (frame.device_id !== this.deviceId || frame.generation !== this.generation)
      throw new ApiError(
        'forbidden',
        'The node frame does not belong to this device and connection generation.',
      );
    switch (frame.type) {
      case 'reply':
        this.settle(frame);
        return;
      case 'capabilities':
        this.emit({ kind: 'capabilities', capabilities: frame.capabilities });
        return;
      case 'native_event':
        this.emit({ kind: 'native', notice: frame.notice });
        return;
      case 'provider_event':
        this.emit({ kind: 'provider', event: frame.event });
        return;
    }
  }

  onEvent(listener: (event: ComputerAiHostEvent) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  stop(): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      if (pending.native !== null) {
        pending.resolve(
          uncertainReply(
            pending.native,
            pending.id,
            'The computer disconnected before confirming the operation. Inspect the native session before submitting another action.',
          ),
        );
        continue;
      }
      pending.reject(
        new ApiError(
          'claude_not_ready',
          'The selected computer disconnected before confirming this request; it was not resent.',
        ),
      );
    }
    this.pending.clear();
    this.listeners.clear();
    this.close();
  }

  private call(request: ComputerAiRead | ComputerAiExecute): Promise<ComputerAiReply> {
    if (this.closed)
      return Promise.reject(new ApiError('claude_not_ready', 'The selected computer is offline.'));
    const native = isNativeOperation(request) ? request : null;
    const id = randomUUID();
    const operationId = native?.operation_id ?? id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (native !== null) {
          resolve(
            uncertainReply(
              native,
              operationId,
              'The computer has not confirmed this operation yet; it may still execute. Read its receipt before submitting another action.',
            ),
          );
          return;
        }
        reject(
          new ApiError(
            'claude_not_ready',
            'The selected computer did not confirm this request in time; it was not resent.',
          ),
        );
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, {
        operation: request.operation,
        native,
        id: operationId,
        resolve,
        reject,
        timer,
      });
      try {
        this.send({
          type: 'request',
          device_id: this.deviceId,
          generation: this.generation,
          id,
          request,
        });
      } catch (cause) {
        this.failedSend(id, cause);
      }
    });
  }

  private failedSend(id: string, cause: unknown): void {
    const pending = this.pending.get(id);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (pending.native !== null) {
      pending.resolve(
        uncertainReply(
          pending.native,
          pending.id,
          'The connection could not confirm delivery. Read this receipt before submitting another action.',
        ),
      );
    } else pending.reject(sendFailure(cause));
  }

  private settle(frame: Extract<NodeAiFrame, { type: 'reply' }>): void {
    const pending = this.pending.get(frame.id);
    if (pending === undefined) return;
    this.pending.delete(frame.id);
    clearTimeout(pending.timer);
    if (!frame.result.ok) {
      pending.reject(new ApiError('claude_not_ready', frame.result.failure.message));
      return;
    }
    const reply = COMPUTER_AI_REPLY.parse(frame.result.reply);
    if (reply.operation !== pending.operation) {
      pending.reject(
        new ApiError(
          'upstream_failed',
          'The selected computer returned a reply for a different operation.',
        ),
      );
      return;
    }
    pending.resolve(reply);
  }

  private emit(event: ComputerAiHostEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function uncertainReply(
  request: NativeOperationRequest,
  id: string,
  error: string,
): ComputerAiReply {
  return {
    operation: request.operation,
    value: {
      native_operation: {
        id,
        operation: request.operation,
        state: 'uncertain',
        value: null,
        error,
      },
    },
  };
}

function sendFailure(cause: unknown): ApiError {
  return cause instanceof ApiError
    ? cause
    : new ApiError(
        'upstream_failed',
        'The selected computer connection could not send this request.',
      );
}
