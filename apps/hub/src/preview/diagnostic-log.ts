import { Logger, messageOf } from '@smarteverything/logging';

const log = new Logger('hub.preview');

export class DiagnosticsLog {
  private readonly openedAt = performance.now();
  private writes = 0;
  private captures = 0;
  private captureFailures = 0;
  private refused = 0;

  constructor(private readonly clientId: string) {
    log.info('diagnostics.socket_opened', { clientId });
  }

  write(): void {
    this.writes += 1;
  }

  captureRefused(requestId: string, readyState: number): void {
    log.warn('diagnostics.capture_refused', { clientId: this.clientId, requestId, readyState });
  }

  captureRequested(requestId: string, pending: number): void {
    this.captures += 1;
    log.debug('diagnostics.capture_requested', { clientId: this.clientId, requestId, pending });
  }

  captureTimedOut(requestId: string, timeoutMs: number): void {
    this.captureFailures += 1;
    log.warn('diagnostics.capture_timed_out', { clientId: this.clientId, requestId, timeoutMs });
  }

  captureAnswered(requestId: string, ok: boolean, hasPixels: boolean): void {
    log.debug('diagnostics.capture_answered', { requestId, ok, hasPixels });
  }

  resultUnmatched(requestId: string): void {
    log.debug('diagnostics.result_unmatched', { requestId });
  }

  inputRefused(cause: unknown, binary: boolean): void {
    this.refused += 1;
    log.warn('diagnostics.input_refused', {
      clientId: this.clientId,
      binary,
      errorName: cause instanceof Error ? cause.name : typeof cause,
      reason: messageOf(cause).slice(0, 200),
    });
  }

  failed(cause: Error): void {
    log.warn('diagnostics.socket_failed', {
      clientId: this.clientId,
      errorName: cause.name,
      reason: cause.message.slice(0, 200),
    });
  }

  closed(code: number, abandoned: number): void {
    log.info('diagnostics.socket_closed', {
      clientId: this.clientId,
      closeCode: code,
      openMs: Math.round(performance.now() - this.openedAt),
      abandoned,
      writes: this.writes,
      captures: this.captures,
      captureFailures: this.captureFailures,
      refused: this.refused,
    });
  }

  static backpressure(buffered: number): void {
    log.warn('diagnostics.backpressure', { buffered });
  }
}
