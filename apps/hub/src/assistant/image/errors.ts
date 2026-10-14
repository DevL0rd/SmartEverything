export class ImageOperationError extends Error {
  override readonly name = 'ImageOperationError';
  constructor(
    readonly code: 'invalid_media' | 'limit' | 'provider' | 'unknown' | 'cancelled',
    readonly detail: string,
  ) {
    super(detail);
  }
}
