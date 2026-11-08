import { ApiError, type ApiErrorCode } from '@smarteverything/domain';
import {
  ClaudeControlFailedError,
  ClaudeControlTimeoutError,
  ClaudeCursorError,
  ClaudeHookInputError,
  ClaudeInvalidAnswerError,
  ClaudeLinkError,
  ClaudeNotReadyError,
  ClaudePromptNotFoundError,
  ClaudePromptNotWaitingError,
  ClaudeSendRefusedError,
  ClaudeSessionNotFoundError,
} from './errors';

type ErrorClass = abstract new (...args: never) => Error;

const CLAUDE_ERRORS: readonly (readonly [ErrorClass, ApiErrorCode])[] = [
  [ClaudeNotReadyError, 'claude_not_ready'],
  [ClaudeSessionNotFoundError, 'not_found'],
  [ClaudeCursorError, 'invalid_request'],
  [ClaudeSendRefusedError, 'forbidden'],
  [ClaudePromptNotFoundError, 'not_found'],
  [ClaudePromptNotWaitingError, 'conflict'],
  [ClaudeInvalidAnswerError, 'invalid_request'],
  [ClaudeHookInputError, 'invalid_request'],
  [ClaudeControlFailedError, 'upstream_failed'],
  [ClaudeControlTimeoutError, 'upstream_failed'],
  [ClaudeLinkError, 'upstream_failed'],
];

export function claudeApiErrorFor(cause: unknown): ApiError | null {
  if (cause instanceof ApiError) return cause;
  for (const [type, code] of CLAUDE_ERRORS) {
    if (cause instanceof type) return new ApiError(code, cause.message);
  }
  return null;
}
