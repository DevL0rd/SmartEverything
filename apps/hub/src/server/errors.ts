import {
  ApiError,
  CommandRefusedError,
  InvalidValueError,
  UnsealError,
  type ApiErrorCode,
} from '@smarteverything/domain';
import type { z } from 'zod';
import {
  CameraOfflineError,
  CameraPrivacyError,
  UnknownStreamError,
} from '../cameras/camera-service';
import { FrameTimeoutError } from '../cameras/frame-cache';
import { Go2rtcError } from '../cameras/go2rtc-client';
import { CameraBusyError, CameraTalkUnsupportedError } from '../cameras/viewers';
import { ThumbnailError } from '../cameras/thumbnails';
import { CameraBlockedByFirewallError } from '../firewall/observed-go2rtc';
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
} from '../claude/errors';
import { StoreNotFoundError } from '../store/context';
import { StoreConflictError } from '../store/sql';

export function issuesOf(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
    .join('; ');
}

type ErrorClass = abstract new (...args: never) => Error;

const KNOWN_ERRORS: readonly (readonly [ErrorClass, ApiErrorCode])[] = [
  [StoreNotFoundError, 'not_found'],
  [StoreConflictError, 'conflict'],
  [CommandRefusedError, 'command_refused'],
  [InvalidValueError, 'command_refused'],
  [UnsealError, 'invalid_request'],
  [UnknownStreamError, 'camera_unavailable'],
  [CameraOfflineError, 'camera_offline'],
  [CameraPrivacyError, 'camera_privacy_on'],
  [CameraBlockedByFirewallError, 'firewall_blocked'],
  [CameraBusyError, 'camera_busy'],
  [CameraTalkUnsupportedError, 'command_refused'],
  [FrameTimeoutError, 'camera_unavailable'],
  [Go2rtcError, 'upstream_failed'],
  [ThumbnailError, 'upstream_failed'],
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

export function apiErrorFor(cause: unknown): ApiError | null {
  if (cause instanceof ApiError) {
    return cause;
  }
  for (const [type, code] of KNOWN_ERRORS) {
    if (cause instanceof type) {
      return new ApiError(code, cause.message);
    }
  }
  return null;
}

export function invalid(what: string, error: z.ZodError): ApiError {
  return new ApiError('invalid_request', `The ${what} is not valid: ${issuesOf(error)}.`);
}
