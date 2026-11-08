import { ApiError } from '@smarteverything/domain';

export class PrinterCallError extends Error {
  override readonly name = 'PrinterCallError';

  constructor(
    message: string,
    readonly reason: string | null,
  ) {
    super(message);
  }
}

export function printerCallErrorOf(error: unknown): PrinterCallError | null {
  return error instanceof ApiError && error.reason !== null
    ? new PrinterCallError(error.message, error.reason)
    : null;
}
