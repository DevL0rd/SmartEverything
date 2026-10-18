import { randomUUID } from 'node:crypto';
import { ApiError, NODE_HARNESS_FRAME } from '@smarteverything/domain';
import type { HarnessCallRequest, HubHarnessControl } from '@smarteverything/domain';
import type { HarnessCallPort } from '@smarteverything/harness/process';
import { Logger } from '@smarteverything/logging';

const log = new Logger('hub.node');

export interface CallSocket {
  readonly OPEN: number;
  readonly readyState: number;
  send(text: string): void;
}
type CallResult = Extract<HubHarnessControl, { type: 'harness_call_result' }>;
interface Link {
  readonly socket: CallSocket;
  readonly binding: Pick<CallResult, 'device_id' | 'generation' | 'runtime_instance'>;
}
interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (cause: Error) => void;
  readonly link: Link;
  readonly operation: string;
  readonly startedAt: number;
}

export class HarnessCalls implements HarnessCallPort {
  private link: Link | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly waiting = new Set<() => void>();

  attach(link: Link): void {
    log.info('harness.link_attached', {
      deviceId: link.binding.device_id,
      generation: link.binding.generation,
      runtimeInstance: link.binding.runtime_instance,
      waiting: this.waiting.size,
      pending: this.pending.size,
    });
    this.link = link;
    for (const wake of this.waiting) wake();
    this.waiting.clear();
  }

  detach(socket: CallSocket): void {
    if (this.link?.socket !== socket) return;
    log.warn('harness.link_detached', {
      deviceId: this.link.binding.device_id,
      generation: this.link.binding.generation,
      pending: this.pending.size,
    });
    this.link = null;
    this.fail(
      (entry) => entry.link.socket === socket,
      new ApiError('upstream_failed', 'The hub connection dropped before this call was answered.'),
    );
  }

  close(): void {
    log.info('harness.calls_closing', { pending: this.pending.size, waiting: this.waiting.size });
    this.link = null;
    this.fail(() => true, new ApiError('conflict', 'The computer harness has stopped.'));
    for (const wake of this.waiting) wake();
    this.waiting.clear();
  }

  receive(frame: CallResult): void {
    const entry = this.pending.get(frame.id);
    if (entry === undefined) {
      log.debug('harness.result_unmatched', { callId: frame.id, ok: frame.result.ok });
      return;
    }
    this.pending.delete(frame.id);
    const durationMs = Math.round(performance.now() - entry.startedAt);
    if (frame.result.ok) {
      log.debug('harness.call_answered', {
        callId: frame.id,
        operation: entry.operation,
        durationMs,
        pending: this.pending.size,
      });
      entry.resolve(frame.result.value);
    } else {
      log.warn('harness.call_refused', {
        callId: frame.id,
        operation: entry.operation,
        durationMs,
        errorCode: frame.result.error.code,
      });
      entry.reject(new ApiError(frame.result.error.code, frame.result.error.message));
    }
  }

  async call(request: HarnessCallRequest, signal?: AbortSignal): Promise<unknown> {
    const waitingAt = performance.now();
    const link = await this.attached(signal);
    const waitedMs = Math.round(performance.now() - waitingAt);
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const operation = request.operation;
      if (waitedMs > 0)
        log.debug('harness.call_waited_for_link', { callId: id, operation, waitedMs });
      const abort = (): void => {
        log.debug('harness.call_aborted', { callId: id, operation, pending: this.pending.size });
        if (this.pending.delete(id)) this.send(link, { type: 'harness_call_cancel', id });
        reject(abortReason(signal));
      };
      this.pending.set(id, {
        resolve: (value): void => {
          signal?.removeEventListener('abort', abort);
          resolve(value);
        },
        reject: (cause: Error): void => {
          signal?.removeEventListener('abort', abort);
          reject(cause);
        },
        link,
        operation,
        startedAt: performance.now(),
      });
      log.trace('harness.call_sent', { callId: id, operation, pending: this.pending.size });
      signal?.addEventListener('abort', abort, { once: true });
      this.send(link, { type: 'harness_call', id, request });
    });
  }

  private attached(signal?: AbortSignal): Promise<Link> {
    signal?.throwIfAborted();
    const link = this.link;
    if (link !== null) return Promise.resolve(link);
    return new Promise((resolve, reject) => {
      const wake = (): void => {
        signal?.removeEventListener('abort', give);
        if (this.link === null)
          reject(new ApiError('conflict', 'The computer harness has stopped.'));
        else resolve(this.link);
      };
      const give = (): void => {
        this.waiting.delete(wake);
        reject(abortReason(signal));
      };
      this.waiting.add(wake);
      signal?.addEventListener('abort', give, { once: true });
    });
  }

  private send(
    link: Link,
    frame:
      | { readonly type: 'harness_call'; readonly id: string; readonly request: HarnessCallRequest }
      | { readonly type: 'harness_call_cancel'; readonly id: string },
  ): void {
    if (link.socket.readyState === link.socket.OPEN)
      link.socket.send(JSON.stringify(NODE_HARNESS_FRAME.parse({ ...link.binding, ...frame })));
    else
      log.warn('harness.frame_dropped', {
        type: frame.type,
        id: frame.id,
        readyState: link.socket.readyState,
      });
  }

  private fail(match: (entry: Pending) => boolean, cause: Error): void {
    for (const [id, entry] of this.pending)
      if (match(entry)) {
        this.pending.delete(id);
        entry.reject(cause);
      }
  }
}

function abortReason(signal: AbortSignal | undefined): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new ApiError('conflict', 'The call was cancelled.');
}
