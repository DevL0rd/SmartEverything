export const NOT_ON_THIS_BUILD = 'This version of the app cannot do that during a call yet.';

export class CallFeatureUnavailableError extends Error {
  override readonly name = 'CallFeatureUnavailableError';

  constructor(
    readonly feature: string,
    readonly reason: string,
  ) {
    super(`${feature} is not available: ${reason}`);
  }
}
