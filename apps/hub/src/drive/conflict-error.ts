export class ConflictError extends Error {
  override readonly name = 'ConflictError';

  constructor(
    readonly failure: 'unknown' | 'resolved' | 'copy-missing',
    message: string,
  ) {
    super(message);
  }
}
