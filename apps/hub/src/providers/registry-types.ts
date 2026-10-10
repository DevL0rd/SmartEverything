import type { Provider, ProviderCredentials } from '@smarteverything/domain';
import type { LinkContext, ProviderModule, StoredAccount } from '../adapters/contract';

export type ModuleRegistry = { readonly [P in Provider]?: ProviderModule<P> };

class ProviderNotConfiguredError extends Error {
  override readonly name = 'ProviderNotConfiguredError';

  constructor(provider: Provider) {
    super(`The ${provider} provider is not configured on this hub.`);
  }
}

function required<T>(provider: Provider, module: T | undefined): T {
  if (module === undefined) {
    throw new ProviderNotConfiguredError(provider);
  }
  return module;
}

export function linkAccount(
  registry: ModuleRegistry,
  credentials: ProviderCredentials,
  context: LinkContext,
): Promise<StoredAccount> {
  switch (credentials.provider) {
    case 'xiaomi':
      return required('xiaomi', registry.xiaomi).link(credentials, context);
    case 'tuya':
      return required('tuya', registry.tuya).link(credentials, context);
    case 'smartthings':
      return required('smartthings', registry.smartthings).link(credentials, context);
    case 'samsung_tv':
      return required('samsung_tv', registry.samsung_tv).link(credentials, context);
  }
}

export function starterFor(
  registry: ModuleRegistry,
  provider: Provider,
): Pick<ProviderModule<Provider>, 'start' | 'labelOf'> {
  return required(provider, registry[provider]);
}
