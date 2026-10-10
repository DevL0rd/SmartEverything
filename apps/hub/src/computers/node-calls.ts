import type {
  HubFrame,
  JsonValue,
  NodeFailureCode,
  NodeRequest,
  NodeResult,
} from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';

const CALL_TIMEOUT_MS = 20_000;

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
}

export class NodeCalls {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly send: (frame: HubFrame) => void) {}

  call(request: NodeRequest): Promise<JsonValue> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new NodeCallError('failed', 'The computer did not answer in time.'));
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
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
    if (result.ok) {
      pending.resolve(result.value);
    } else {
      pending.reject(new NodeCallError(result.failure.code, result.failure.message));
    }
    return true;
  }

  close(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new NodeCallError('failed', 'The computer went offline.'));
    }
    this.pending.clear();
  }
}
