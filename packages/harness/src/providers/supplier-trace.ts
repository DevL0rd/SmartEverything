import type { SubscriptionInferenceRequest } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';

const log = new Logger('hub.harness-supplier');

export function callFields(
  id: string,
  request: SubscriptionInferenceRequest,
  pending: number,
): Record<string, unknown> {
  return {
    call_id: id,
    kind: request.kind,
    route: request.route.id,
    model: request.kind === 'stream' ? request.options.model : request.model,
    session_id: request.kind === 'stream' ? request.claim.session_id : undefined,
    pending,
  };
}

function since(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

export function admitted(fields: Record<string, unknown>): void {
  log.debug('inference.admitted', fields);
}

export function slotAcquired(fields: Record<string, unknown>, startedAt: number): void {
  log.debug('inference.slot_acquired', () => ({ ...fields, waitedMs: since(startedAt) }));
}

export function finished(fields: Record<string, unknown>, chunks: number, startedAt: number): void {
  log.info('inference.finished', { ...fields, chunks, durationMs: since(startedAt) });
}

export function failed(
  fields: Record<string, unknown>,
  outcome: {
    readonly cause: unknown;
    readonly failure: { readonly code: string };
    readonly abort: AbortController;
    readonly call: { readonly sequence: number };
    readonly startedAt: number;
  },
): void {
  const { cause } = outcome;
  log.warn('inference.failed', {
    ...fields,
    failureCode: outcome.failure.code,
    cause: cause instanceof Error ? cause.name : typeof cause,
    reason: cause instanceof Error ? cause.message.slice(0, 300) : undefined,
    aborted: outcome.abort.signal.aborted,
    chunks: outcome.call.sequence,
    durationMs: since(outcome.startedAt),
  });
}

export function idleTimeout(idleMs: number, chunks: number): void {
  log.warn('inference.idle_timeout', { idleMs, chunks });
}

export function creditTimeout(timeoutMs: number, chunk: number): void {
  log.warn('inference.credit_timeout', { timeoutMs, chunk });
}

export function cancelRequested(id: string, known: boolean): void {
  log.info('inference.cancel_requested', { call_id: id, known });
}

export function channelStopped(pending: number): void {
  log.warn('inference.channel_stopped', { pending });
}
