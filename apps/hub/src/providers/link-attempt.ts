import type { Provider, ProviderProblem } from '@smarteverything/domain';

export interface Attempt {
  cancelled: boolean;
}

export class LinkCancelledError extends Error {
  override readonly name = 'LinkCancelledError';
  readonly problem: ProviderProblem = 'cancelled';

  constructor(provider: Provider) {
    super(`Signing in to ${provider} was stopped before it finished.`);
  }
}
