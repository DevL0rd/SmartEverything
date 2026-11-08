import { ApiError } from '@smarteverything/domain';
import { ServerUnreachableError } from '../../../api/connection/client';
import { friendlyError, rawErrorText } from '../../../format/errors';
import { UpdateFailure, type UpdateFailureCause } from './adapter';

const BEARER = /bearer\s+[^\s"',;}]+/gi;
const REDACTED = '[redacted]';

export function safeReason(error: unknown, token: string | null): string {
  const text = rawErrorText(error).replace(BEARER, REDACTED);
  return token === null || token === '' ? text : text.split(token).join(REDACTED);
}

const GENERIC: Readonly<Record<UpdateFailureCause, string>> = {
  check: 'The app couldn’t check for updates. Try again.',
  download: 'The update couldn’t be downloaded. Try again.',
  restart: 'The app couldn’t restart to finish the update. Try again.',
  launch: 'The update stopped before it opened.',
};

const UNREACHABLE = 'Your home can’t be reached right now. Try again when you’re connected.';

export function isNetworkFailure(error: unknown): boolean {
  return error instanceof ServerUnreachableError;
}

function sentenceOf(cause: UpdateFailureCause, error: unknown): string {
  if (isNetworkFailure(error)) return UNREACHABLE;
  if (error instanceof ApiError) return friendlyError(error) ?? GENERIC[cause];
  return GENERIC[cause];
}

export function failureOf(cause: UpdateFailureCause, error: unknown): UpdateFailure {
  if (error instanceof UpdateFailure) return error;
  return new UpdateFailure(
    cause,
    sentenceOf(cause, error),
    rawErrorText(error),
    cause === 'restart' && isNetworkFailure(error),
  );
}

export async function asFailure<T>(cause: UpdateFailureCause, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw failureOf(cause, error);
  }
}
