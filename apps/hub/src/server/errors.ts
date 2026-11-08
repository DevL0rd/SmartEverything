import {
  ApiError,
  AutomationBindingError,
  AutomationValueError,
  CommandRefusedError,
  InvalidValueError,
  type ApiErrorCode,
} from '@smarteverything/domain';
import type { z } from 'zod';
import {
  CameraOfflineError,
  CameraPrivacyError,
  UnknownStreamError,
} from '../cameras/camera-service';
import { CameraFirewallDownError } from '../cameras/camera-health';
import { FrameTimeoutError } from '../cameras/frame-cache';
import { Go2rtcError } from '../cameras/go2rtc-client';
import { CameraBusyError, CameraTalkUnsupportedError } from '../cameras/viewers';
import { ThumbnailError } from '../cameras/thumbnails';
import { CameraBlockedByFirewallError } from '../firewall/observed-go2rtc';
import { claudeApiErrorFor } from '../claude/api-errors';
import { IrLibraryEntryUnknownError } from '../infrared/library/ir-library';
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
  [IrLibraryEntryUnknownError, 'not_found'],
  [AutomationBindingError, 'invalid_request'],
  [AutomationValueError, 'invalid_request'],
  [StoreConflictError, 'conflict'],
  [CommandRefusedError, 'command_refused'],
  [InvalidValueError, 'command_refused'],
  [UnknownStreamError, 'camera_unavailable'],
  [CameraFirewallDownError, 'firewall_blocked'],
  [CameraOfflineError, 'camera_offline'],
  [CameraPrivacyError, 'camera_privacy_on'],
  [CameraBlockedByFirewallError, 'firewall_blocked'],
  [CameraBusyError, 'camera_busy'],
  [CameraTalkUnsupportedError, 'command_refused'],
  [FrameTimeoutError, 'camera_unavailable'],
  [Go2rtcError, 'upstream_failed'],
  [ThumbnailError, 'upstream_failed'],
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
  return claudeApiErrorFor(cause);
}

export interface HttpFailure {
  readonly error: ApiError;
  readonly unexpected: { readonly cause: unknown } | null;
}

export function httpFailureOf(cause: unknown): HttpFailure {
  const known = apiErrorFor(cause);
  if (known !== null) return { error: known, unexpected: null };
  return {
    error: new ApiError('internal', 'The server failed while handling this request; see its log.'),
    unexpected: { cause },
  };
}

export function invalid(what: string, error: z.ZodError): ApiError {
  return new ApiError('invalid_request', `The ${what} is not valid: ${issuesOf(error)}.`);
}

export class InvalidResponseError extends ApiError {
  readonly issueCodes: readonly string[];

  constructor(path: string, error: z.ZodError) {
    super('internal', `The server built an invalid response for ${path}.`);
    this.issueCodes = [...new Set(error.issues.map((issue) => issue.code))];
  }
}
