import { ApiError } from '@smarteverything/domain';
import { Logger, passesThreshold, type LogPayload } from '@smarteverything/logging';
import type { Caller } from '../auth';

const log = new Logger('hub.handlers');

const SLOW_HANDLER_MS = 250;

function callerFields(caller: Caller): LogPayload {
  switch (caller.kind) {
    case 'anonymous':
      return { callerKind: 'anonymous' };
    case 'service':
      return {
        callerKind: 'service',
        profileId: caller.profileId,
        chatId: caller.chatId ?? undefined,
      };
    case 'client':
      return {
        callerKind: 'client',
        clientId: caller.client.id,
        role: caller.client.role,
        profileId: caller.profileId,
        chatId: caller.chatId,
        via: caller.via,
        mcpOrigin: caller.mcpOrigin,
      };
  }
}

export interface HandlerRun {
  readonly rejected: (part: 'path' | 'query' | 'body', cause: unknown) => void;
  readonly finished: (handlerMs: number) => void;
  readonly failed: (cause: unknown) => void;
}

export function beginHandler(route: string, access: string, caller: Caller): HandlerRun {
  const startedAt = performance.now();
  const tracing = passesThreshold('trace', Logger.level);
  if (tracing) log.trace('handler.started', () => ({ route, access, ...callerFields(caller) }));
  const elapsed = (): number => Math.round((performance.now() - startedAt) * 100) / 100;
  return {
    rejected: (part, cause): void => {
      log.debug('handler.rejected', () => ({
        route,
        part,
        errorName: cause instanceof Error ? cause.name : typeof cause,
        ...callerFields(caller),
      }));
    },
    finished: (handlerMs): void => {
      const durationMs = elapsed();
      if (durationMs >= SLOW_HANDLER_MS) {
        log.info('handler.slow', { route, durationMs, handlerMs, ...callerFields(caller) });
      } else if (tracing) {
        log.trace('handler.finished', { route, durationMs, handlerMs });
      }
    },
    failed: (cause): void => {
      log.debug('handler.failed', () => ({
        route,
        durationMs: elapsed(),
        errorName: cause instanceof Error ? cause.name : typeof cause,
        errorCode: cause instanceof ApiError ? cause.code : undefined,
        status: cause instanceof ApiError ? cause.status : undefined,
        ...callerFields(caller),
      }));
    },
  };
}
