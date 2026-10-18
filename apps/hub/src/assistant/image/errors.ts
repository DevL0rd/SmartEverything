export class ImageOperationError extends Error {
  override readonly name = 'ImageOperationError';
  constructor(
    readonly code: 'invalid_media' | 'provider' | 'unknown',
    readonly detail: string,
  ) {
    super(detail);
  }
}
