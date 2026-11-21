import type { Provider, ProviderAdapter } from '@smarteverything/domain';
import { ProviderNotRunningError } from '../../src/commands/command-errors';
import type { AdapterDirectory } from '../../src/commands/executor';

export function adapterDirectory(
  adapterOf: (provider: Provider) => ProviderAdapter | undefined,
): AdapterDirectory {
  return {
    adapterFor: adapterOf,
    started: (provider): Promise<ProviderAdapter> => {
      const adapter = adapterOf(provider);
      return adapter === undefined
        ? Promise.reject(new ProviderNotRunningError(provider))
        : Promise.resolve(adapter);
    },
  };
}
