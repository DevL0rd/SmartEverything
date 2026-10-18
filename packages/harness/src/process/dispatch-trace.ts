import type { HarnessRuntimeReceipt, HarnessRuntimeRequest } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';

const log = new Logger('hub.harness');

const QUIET_KINDS: ReadonlySet<string> = new Set(['note']);

function sessionOf(request: HarnessRuntimeRequest): string {
  return request.kind === 'open' ? request.claim.session_id : request.session_id;
}

function fieldsOf(id: string, request: HarnessRuntimeRequest): Record<string, unknown> {
  return {
    request_id: id,
    kind: request.kind,
    session_id: sessionOf(request),
    expected_epoch: request.kind === 'open' ? request.claim.epoch : request.expected_epoch,
  };
}

export async function traced(
  id: string,
  request: HarnessRuntimeRequest,
  run: () => Promise<HarnessRuntimeReceipt>,
): Promise<HarnessRuntimeReceipt> {
  const startedAt = performance.now();
  const fields = fieldsOf(id, request);
  log.debug('dispatch.started', fields);
  try {
    const receipt = await run();
    log[QUIET_KINDS.has(request.kind) ? 'debug' : 'info']('dispatch.finished', {
      ...fields,
      state: receipt.state,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return receipt;
  } catch (cause) {
    log.error('dispatch.failed', cause, {
      ...fields,
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw cause;
  }
}

export function epochMismatch(id: string, request: HarnessRuntimeRequest, held: number): void {
  if (request.kind === 'open' || request.expected_epoch === held) return;
  log.warn('dispatch.epoch_mismatch', { ...fieldsOf(id, request), held_epoch: held });
}

export function openReused(id: string, session: string, epoch: number): void {
  log.debug('dispatch.open_reused', { request_id: id, session_id: session, epoch });
}

export function openUnwinding(id: string, session: string, cause: unknown): void {
  log.warn('dispatch.open_unwinding', {
    request_id: id,
    session_id: session,
    cause: cause instanceof Error ? cause.name : typeof cause,
  });
}

export function openSuperseding(session: string, previous: number, epoch: number): void {
  log.info('dispatch.open_superseding', {
    session_id: session,
    previous_epoch: previous,
    epoch,
  });
}
