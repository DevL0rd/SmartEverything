import type {
  HubFrame,
  JsonValue,
  NodeFailureCode,
  NodeRequest,
  NodeResult,
} from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { Logger } from '@smarteverything/logging';

const CALL_TIMEOUT_MS = 20_000;

const log = new Logger('hub.computers');

export class NodeCallError extends Error {
  override readonly name = 'NodeCallError';

  constructor(
    readonly code: NodeFailureCode,
    message: string,
  ) {
    super(message);
  }
}

interface Pending {
  readonly resolve: (value: JsonValue) => void;
  readonly reject: (cause: NodeCallError) => void;
  readonly timer: NodeJS.Timeout;
  readonly verb: string;
  readonly startedAt: number;
}

export class NodeCalls {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly send: (frame: HubFrame) => void) {}

  call(request: NodeRequest): Promise<JsonValue> {
    const id = randomUUID();
    const startedAt = performance.now();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        log.warn('computer.call_timed_out', {
          requestId: id,
          verb: request.verb,
          timeoutMs: CALL_TIMEOUT_MS,
          pending: this.pending.size,
        });
        reject(new NodeCallError('failed', 'The computer did not answer in time.'));
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer, verb: request.verb, startedAt });
      log.debug('computer.call_sent', {
        requestId: id,
        verb: request.verb,
        pending: this.pending.size,
      });
      this.send({ type: 'request', id, request });
    });
  }

  settle(id: string, result: NodeResult): boolean {
    const pending = this.pending.get(id);
    if (pending === undefined) {
      return false;
    }
    this.pending.delete(id);
    clearTimeout(pending.timer);
    const durationMs = Math.round(performance.now() - pending.startedAt);
    if (result.ok) {
      log.debug('computer.call_answered', { requestId: id, verb: pending.verb, durationMs });
      pending.resolve(result.value);
    } else {
      log.warn('computer.call_refused', {
        requestId: id,
        verb: pending.verb,
        failureCode: result.failure.code,
        reason: result.failure.message,
        durationMs,
      });
      pending.reject(new NodeCallError(result.failure.code, result.failure.message));
    }
    return true;
  }

  close(): void {
    if (this.pending.size > 0) {
      log.warn('computer.calls_dropped', { pending: this.pending.size });
    }
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new NodeCallError('failed', 'The computer went offline.'));
    }
    this.pending.clear();
  }
}
