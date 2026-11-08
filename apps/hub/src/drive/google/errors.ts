export const IMPORT_FAILURES = [
  'client_missing',
  'state_mismatch',
  'redirect_mismatch',
  'consent_refused',
  'no_refresh_token',
  'consent_expired',
  'token_discarded',
  'google_refused',
  'google_unreachable',
  'no_library_folder',
  'storage_full',
  'not_found',
  'not_resumable',
  'already_running',
  'nothing_selected',
] as const;

export type ImportFailure = (typeof IMPORT_FAILURES)[number];

export class GoogleImportError extends Error {
  override readonly name = 'GoogleImportError';

  constructor(
    readonly failure: ImportFailure,
    override readonly cause?: unknown,
  ) {
    super(`The Google import stopped: ${failure}.`);
  }
}

export class GoogleApiError extends Error {
  override readonly name = 'GoogleApiError';

  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`Google answered ${String(status)}.`);
  }
}
