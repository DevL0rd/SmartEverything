import { Logger } from '@smarteverything/logging';

const log = new Logger('hub.harness');

export interface InferenceIdentity {
  readonly harnessSession: string;
  readonly deviceId: string;
  readonly routeId: string;
  readonly model: string;
  readonly messages: number;
  readonly tools: number;
}

export class InferenceTrace {
  private readonly startedAt = performance.now();
  private chunks = 0;
  private bytes = 0;
  private firstByteMs = 0;

  constructor(private readonly identity: InferenceIdentity) {
    log.debug('harness.inference_started', () => ({ ...identity }));
  }

  upstream(status: number, retryAfter: string | null): void {
    this.firstByteMs = this.elapsed();
    if (status >= 400) {
      log.warn('harness.inference_upstream_refused', {
        ...this.identity,
        status,
        retryAfter: retryAfter ?? undefined,
        firstByteMs: this.firstByteMs,
      });
    }
  }

  chunk(byteLength: number): void {
    this.chunks += 1;
    this.bytes += byteLength;
  }

  disconnected(): void {
    log.info('harness.inference_disconnected', this.fields({}));
  }

  finished(status: number): void {
    log.info('harness.inference_finished', this.fields({ status }));
  }

  failed(cause: unknown): void {
    log.error('harness.inference_failed', cause, this.fields({}));
  }

  private fields(extra: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return {
      ...this.identity,
      ...extra,
      chunks: this.chunks,
      bytes: this.bytes,
      firstByteMs: this.firstByteMs,
      durationMs: this.elapsed(),
    };
  }

  private elapsed(): number {
    return Math.round(performance.now() - this.startedAt);
  }
}
