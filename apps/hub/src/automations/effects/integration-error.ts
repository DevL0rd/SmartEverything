export type IntegrationErrorKind =
  'Invalid' | 'NotFound' | 'Forbidden' | 'Refused' | 'Unreachable' | 'Timeout' | 'LimitExceeded';

export class IntegrationError extends Error {
  override readonly name = 'IntegrationError';

  constructor(
    readonly kind: IntegrationErrorKind,
    message: string,
  ) {
    super(message);
  }
}
