import { LlmError } from '@deepseek-ai/dsh-llm';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import { ApiError } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { LogPayload } from '@smarteverything/logging';

export const METERED_REFUSED_CODE = 'METERED_REFUSED';
export const ROUTE_UNAVAILABLE_CODE = 'ROUTE_UNAVAILABLE';

function refusalCode(refusal: ApiError): string {
  return refusal.reason === 'model_unavailable' ? ROUTE_UNAVAILABLE_CODE : METERED_REFUSED_CODE;
}

const log = new Logger('hub.harness');

export class MeteredRefusals {
  private refusal: ApiError | undefined;

  constructor(private readonly fields: LogPayload) {}

  async observed<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (cause) {
      this.record(cause);
      throw cause;
    }
  }

  refused(cause: unknown): unknown {
    this.record(cause);
    return cause instanceof ApiError ? new LlmError(cause.message, refusalCode(cause)) : cause;
  }

  async *surfaced(chunks: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    try {
      for await (const chunk of chunks) yield this.mapped(chunk);
    } catch (cause) {
      throw this.refused(cause);
    }
  }

  private mapped(chunk: StreamChunk): StreamChunk {
    const refusal = this.refusal;
    if (refusal === undefined || chunk.type !== 'finish' || chunk.reason.kind !== 'error')
      return chunk;
    return {
      ...chunk,
      reason: {
        kind: 'error',
        failure: { message: refusal.message, code: refusalCode(refusal) },
      },
    };
  }

  private record(cause: unknown): void {
    if (!(cause instanceof ApiError) || this.refusal !== undefined) return;
    this.refusal = cause;
    log.warn('metered.refused', {
      ...this.fields,
      refusal: cause.code,
      reason: cause.message,
    });
  }
}
