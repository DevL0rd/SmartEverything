export class WidgetUnavailableError extends Error {
  override readonly name = 'WidgetUnavailableError';

  constructor(
    readonly subject: string,
    readonly reason: string,
  ) {
    super(`Cannot show ${subject}: ${reason}`);
  }
}
