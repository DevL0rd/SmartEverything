import { basename } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import type { HubLayout } from '../data-layout';
import { loadSecretKey } from './key';
import { SecretStore } from './store';

export async function openSecretStore(
  keys: HubLayout['system']['keys'],
  log: Logger,
): Promise<SecretStore> {
  const store = await SecretStore.open(keys.secrets, await loadSecretKey(keys.secretKey, log));
  log.info('secret_key.loaded', { file: basename(keys.secretKey) });
  return store;
}
