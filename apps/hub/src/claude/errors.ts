import { messageOf } from '@smarteverything/logging';
export class ClaudeNotReadyError extends Error {
  override readonly name = 'ClaudeNotReadyError';

  constructor(
    readonly feature: string,
    readonly reason: string,
  ) {
    super(`Claude ${feature} is not available: ${reason}.`);
  }
}

export class ClaudeSessionNotFoundError extends Error {
  override readonly name = 'ClaudeSessionNotFoundError';

  constructor(readonly sessionId: string) {
    super(`No Claude session has the id ${sessionId}.`);
  }
}

export class ClaudeWatchError extends Error {
  override readonly name = 'ClaudeWatchError';

  constructor(
    readonly directory: string,
    cause: unknown,
  ) {
    super(`Could not watch ${directory}: ${messageOf(cause)}.`, { cause });
  }
}

export class ClaudeProcReadError extends Error {
  override readonly name = 'ClaudeProcReadError';

  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(`Could not read ${path}: ${reason}.`);
  }
}

export class ClaudeFileReadError extends Error {
  override readonly name = 'ClaudeFileReadError';

  constructor(
    readonly path: string,
    cause: unknown,
  ) {
    super(`Could not read ${path}: ${messageOf(cause)}.`, {
      cause,
    });
  }
}

export class ClaudeCursorError extends Error {
  override readonly name = 'ClaudeCursorError';

  constructor(
    readonly cursor: number,
    readonly size: number,
  ) {
    super(
      `The cursor ${String(cursor)} is beyond the end of the transcript, which is ${String(size)} bytes.`,
    );
  }
}

export class ClaudePromptNotFoundError extends Error {
  override readonly name = 'ClaudePromptNotFoundError';

  constructor(readonly promptId: string) {
    super(`No Claude prompt has the id ${promptId}.`);
  }
}

export class ClaudePromptNotWaitingError extends Error {
  override readonly name = 'ClaudePromptNotWaitingError';

  constructor(
    readonly promptId: string,
    readonly state: string,
  ) {
    super(`Claude prompt ${promptId} is no longer waiting; it is ${state}.`);
  }
}

export class ClaudeInvalidAnswerError extends Error {
  override readonly name = 'ClaudeInvalidAnswerError';

  constructor(
    readonly promptId: string,
    readonly problem: string,
  ) {
    super(`The answer to Claude prompt ${promptId} is not valid: ${problem}.`);
  }
}

export class ClaudeControlFailedError extends Error {
  override readonly name = 'ClaudeControlFailedError';

  constructor(
    readonly action: string,
    readonly via: string,
    readonly reason: string,
  ) {
    super(`Claude ${action} through the ${via} failed: ${reason}.`);
  }
}

export class ClaudeControlTimeoutError extends Error {
  override readonly name = 'ClaudeControlTimeoutError';

  constructor(
    readonly action: string,
    readonly via: string,
    readonly seconds: number,
  ) {
    super(
      `Claude ${action} through the ${via} has an uncertain outcome after ${String(seconds)} s; it may still finish. Inspect its receipt and native session before submitting another action.`,
    );
  }
}

export class ClaudeLinkError extends Error {
  override readonly name = 'ClaudeLinkError';

  constructor(
    readonly step: string,
    reason: string,
  ) {
    super(`The SmartEverything link ${step} failed: ${reason}.`);
  }
}

export class ClaudeHookInputError extends Error {
  override readonly name = 'ClaudeHookInputError';

  constructor(readonly problem: string) {
    super(`A Claude hook sent something unusable: ${problem}.`);
  }
}

export class ClaudeSendRefusedError extends Error {
  override readonly name = 'ClaudeSendRefusedError';

  constructor(readonly reason: string) {
    super(`Sending to this Claude session is refused: ${reason}.`);
  }
}

export class ClaudeControlUncertainError extends Error {
  override readonly name = 'ClaudeControlUncertainError';
  constructor(
    readonly action: string,
    readonly reason: string,
  ) {
    super(
      `Claude ${action} has an uncertain outcome: ${reason}. Inspect its receipt and native session before submitting another action.`,
    );
  }
}
