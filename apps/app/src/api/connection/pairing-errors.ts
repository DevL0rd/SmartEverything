import { Logger } from '@smarteverything/logging';
import { failureFacts } from './request-log';

const log = new Logger('app.pairing');
export class PairingError extends Error {
  override readonly name: string = 'PairingError';
}
export class PairingIdentityError extends PairingError {
  override readonly name = 'PairingIdentityError';
  constructor() {
    super('That is not the home you chose. Choose it again, or scan the code on your desktop.');
  }
}
export class PairingTargetError extends PairingError {
  override readonly name = 'PairingTargetError';
  constructor() {
    super('This pairing code cannot be used. Show a new one on your desktop and scan it again.');
  }
}
export class PairingCancelledError extends PairingError {
  override readonly name = 'PairingCancelledError';
  constructor() {
    super('Pairing was cancelled.');
  }
}
export class PairingUnreadableError extends PairingError {
  override readonly name = 'PairingUnreadableError';
  constructor() {
    super('Your home answered in a way this app cannot read. Update the app and the server.');
  }
}
export class PairingUnreachableError extends PairingError {
  override readonly name = 'PairingUnreachableError';
  constructor() {
    super('Your home could not be reached. Keep both devices on the same network and try again.');
  }
}
export class PairingUnavailableError extends PairingError {
  override readonly name = 'PairingUnavailableError';
  constructor() {
    super('That home is no longer nearby. Search again, or scan its code.');
  }
}
export class PairingProofError extends PairingError {
  override readonly name = 'PairingProofError';
  constructor() {
    super(
      'The pairing code did not match this home. Check the code, or choose your home again if it keeps failing.',
    );
  }
}
export class PairingResponseError extends PairingError {
  override readonly name = 'PairingResponseError';
  constructor(readonly status: number) {
    super(
      status === 422
        ? 'That pairing code is not valid or has expired. Ask the owner to show a new one.'
        : status === 429
          ? 'Too many attempts. Wait a minute and try again.'
          : 'Your home could not finish pairing. Try again.',
    );
  }
}
export class PairingBusyError extends PairingError {
  override readonly name = 'PairingBusyError';
  constructor() {
    super('Finish or cancel the current pairing before starting another.');
  }
}
export class PairingUnknownOutcomeError extends PairingError {
  override readonly name = 'PairingUnknownOutcomeError';
  constructor() {
    super(
      'Pairing may have finished. Check Paired devices on your desktop before showing a new code.',
    );
  }
}
class PairingCleanupError extends AggregateError {
  override readonly name = 'PairingCleanupError';
  constructor(
    readonly failures: readonly { readonly operation: string; readonly cause: unknown }[],
  ) {
    super(
      failures.map((failure) => failure.cause),
      'The pairing cleanup did not finish. Try again.',
    );
  }
}
export interface PairingCleanupStep {
  readonly operation: string;
  readonly release: () => void | Promise<void>;
}
export async function releasePairingResources(steps: readonly PairingCleanupStep[]): Promise<void> {
  const results = await Promise.all(
    steps.map(async (step) => {
      try {
        await step.release();
        return [];
      } catch (error) {
        log.warn('pairing.cleanup_failed', { operation: step.operation, ...failureFacts(error) });
        return [{ operation: step.operation, cause: error }];
      }
    }),
  );
  const failures = results.flat();
  if (failures.length > 0) throw new PairingCleanupError(failures);
}
export function pairingMessage(error: unknown): string {
  return (error instanceof PairingError ? error : new PairingUnreachableError()).message;
}
