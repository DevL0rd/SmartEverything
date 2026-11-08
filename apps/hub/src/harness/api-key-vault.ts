import type { ApiKeyVault } from '@smarteverything/harness';
import type { SecretStore } from '../secrets/store';

export class SecretApiKeyVault implements ApiKeyVault {
  readonly source = 'hub';

  constructor(private readonly secrets: SecretStore) {}

  read = (reference: string): Promise<string | undefined> =>
    Promise.resolve(this.secrets.apiKey(reference) ?? undefined);

  write = (reference: string, value: string): Promise<void> =>
    this.secrets.saveApiKey(reference, value);

  remove = (reference: string): Promise<void> => this.secrets.removeApiKey(reference);

  watch = (listener: (reference: string) => void): (() => void) =>
    this.secrets.onApiKeyChange(listener);
}
