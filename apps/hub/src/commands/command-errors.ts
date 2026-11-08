import type { Provider } from '@smarteverything/domain';

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
