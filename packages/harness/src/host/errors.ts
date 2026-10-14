import type { AiHarnessFailure } from '@smarteverything/domain';

export class HarnessRuntimeError extends Error {
  constructor(
    readonly code: AiHarnessFailure['code'],
    message: string,
    readonly sessionId: string | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'HarnessRuntimeError';
  }
}
