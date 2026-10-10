import { ApiError, type ApiErrorCode } from '@smarteverything/domain';

const API_MESSAGES: Readonly<Record<ApiErrorCode, string>> = {
  invalid_request: 'The app sent something your server could not accept.',
  unauthorized: 'This device is no longer paired with your server.',
  forbidden: 'Only the owner can do this.',
  not_found: 'This no longer exists.',
  method_not_allowed: 'Your server does not support this yet.',
  conflict: 'Something changed at the same time. Try again.',
  link_expired: 'The link expired. Start again.',
  payload_too_large: 'That is too large to send.',
  unsupported_media_type: 'That file type is not supported.',
  command_refused: 'The device refused the command.',
  pairing_code_invalid: 'That pairing code is not valid.',
  public_url_not_verified: 'Set up remote access first.',
  rate_limited: 'Too many tries. Wait a moment and try again.',
  internal: 'Your server ran into a problem.',
  upstream_failed: 'A service your server depends on did not answer.',
  camera_unavailable: 'The camera is not available right now.',
  camera_offline: 'The camera is offline.',
  camera_privacy_on: 'Privacy mode is on.',
  firewall_blocked: 'Your computer’s firewall is blocking this camera.',
  camera_busy: 'Too many people are watching this camera.',
  claude_not_ready: 'Claude Desktop needs the SmartEverything link for this.',
};

export interface ErrorText {
  readonly title: string;
  readonly detail: string;
}

const NATIVE_MESSAGES: Readonly<Record<string, string>> = {
  AppUpdateNeededError: 'Update the app to use this.',
  HealthConnectMissingError: 'Only available in the Android app.',
};

function nativeMessage(error: Error): string | null {
  const known = NATIVE_MESSAGES[error.name];
  if (known !== undefined) {
    return known;
  }
  return error instanceof TypeError && error.message.includes('is not a function')
    ? 'Update the app to use this.'
    : null;
}

export function friendlyError(error: unknown): string | null {
  if (error instanceof ApiError) {
    return API_MESSAGES[error.code];
  }
  return error instanceof Error ? nativeMessage(error) : null;
}

export function rawErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorText(error: unknown): ErrorText {
  if (error instanceof ApiError) {
    return { title: API_MESSAGES[error.code], detail: error.message };
  }
  if (error instanceof Error) {
    return { title: nativeMessage(error) ?? 'Something went wrong.', detail: error.message };
  }
  return { title: 'Something went wrong.', detail: String(error) };
}
