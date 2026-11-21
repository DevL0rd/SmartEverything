import type { Provider } from '@smarteverything/domain';
import { failureLine } from '@smarteverything/logging';

export class CommandTargetError extends Error {
  override readonly name = 'CommandTargetError';

  constructor(commandId: string, reason: string) {
    super(`Command ${commandId} cannot run: ${reason}.`);
  }
}

export class ProviderNotRunningError extends Error {
  override readonly name = 'ProviderNotRunningError';

  constructor(provider: Provider) {
    super(`The ${provider} provider is not linked or not running on this hub.`);
  }
}

export class ProviderStartFailedError extends Error {
  override readonly name = 'ProviderStartFailedError';

  constructor(provider: Provider, cause: unknown) {
    super(`The ${provider} provider failed to start: ${failureLine(cause)}`, { cause });
  }
}
