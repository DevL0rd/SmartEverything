export function assertUploadActive(signal?: AbortSignal): void {
  if (signal?.aborted !== true) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error('The media operation was cancelled.');
  error.name = 'AbortError';
  throw error;
}
