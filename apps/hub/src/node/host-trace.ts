import type { Logger } from '@smarteverything/logging';
import { messageOf } from '@smarteverything/logging';

const SLOW_CALL_MS = 1000;

export function failureFields(cause: unknown): Record<string, unknown> {
  return {
    errorName: cause instanceof Error ? cause.name : typeof cause,
    reason: messageOf(cause).slice(0, 300),
  };
}

export async function traceHostCall<T>(
  host: { readonly log: Logger; readonly runtime: string },
  kind: 'read' | 'execute',
  operation: string,
  work: () => Promise<T>,
): Promise<T> {
  const { log, runtime } = host;
  const startedAt = performance.now();
  log.trace('host.call_started', { runtime, kind, operation });
  try {
    const result = await work();
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= SLOW_CALL_MS) {
      log.info('host.call_slow', { runtime, kind, operation, durationMs });
    } else {
      log.debug('host.call_finished', { runtime, kind, operation, durationMs });
    }
    return result;
  } catch (cause) {
    log.warn('host.call_failed', {
      runtime,
      kind,
      operation,
      durationMs: Math.round(performance.now() - startedAt),
      ...failureFields(cause),
    });
    throw cause;
  }
}
