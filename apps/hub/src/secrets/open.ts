import { join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import { KEY_FILE_NAME, loadSecretKey } from './key';
import { SecretStore } from './store';

export const SECRETS_FILE_NAME = 'secrets.json.enc';

export async function openSecretStore(dataDirectory: string, log: Logger): Promise<SecretStore> {
  const store = await SecretStore.open(
    join(dataDirectory, SECRETS_FILE_NAME),
    await loadSecretKey(dataDirectory, log),
  );
  log.info('secret_key.loaded', { file: KEY_FILE_NAME });
  return store;
}
