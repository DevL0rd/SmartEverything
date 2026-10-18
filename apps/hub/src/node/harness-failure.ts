import { HarnessRuntimeError } from '@smarteverything/harness';
import type { AiHarnessFailure } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';

export function harnessFailure(cause: unknown): AiHarnessFailure {
  const message = messageOf(cause).slice(0, 2000);
  return {
    code: cause instanceof HarnessRuntimeError ? cause.code : 'operation_failed',
    message: message === '' ? 'Computer native operation failed.' : message,
    retry_at: null,
  };
}
