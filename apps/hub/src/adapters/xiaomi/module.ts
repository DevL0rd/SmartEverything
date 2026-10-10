import type { ProviderAdapter } from '@smarteverything/domain';
import type { ProviderModule, StoredAccount } from '../contract';
import { labelOf, secretsOf, storedAccountOf } from './account';
import { AccountHttp } from './account-http';
import { XiaomiAdapter } from './adapter';
import type { CameraMotor } from './camera-motor';
import { XiaomiCloud, accountCookies } from './cloud-api';
import type { XiaomiDependencies } from './dependencies';
import { signInWithPassword } from './login-flow';
import { SpecStore } from './spec-store';

const DEVICE_ID_LENGTH = 16;
const DEVICE_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function deviceIdFrom(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => DEVICE_ID_ALPHABET.charAt(byte % DEVICE_ID_ALPHABET.length))
    .join('');
}

export function createXiaomiModule(
  dependencies: XiaomiDependencies,
  motor: CameraMotor | null,
): ProviderModule<'xiaomi'> {
  return {
    provider: 'xiaomi',
    link: async (credentials, context): Promise<StoredAccount> => {
      const deviceId = deviceIdFrom(dependencies.randomBytes(DEVICE_ID_LENGTH));
      const http = new AccountHttp(dependencies.fetch, accountCookies(deviceId));
      const tokens = await signInWithPassword(
        { http, ask: context.ask, log: context.log },
        credentials,
      );
      context.log.info('xiaomi_account.linked', { region: credentials.region });
      return storedAccountOf({
        ...tokens,
        deviceId,
        region: credentials.region,
        account: credentials.username,
      });
    },
    labelOf: (account): string => labelOf(secretsOf(account)),
    start: async (account, context): Promise<ProviderAdapter> => {
      const secrets = secretsOf(account);
      const cloud = new XiaomiCloud(dependencies, secrets, {
        saveSecrets: (renewed): Promise<void> => context.saveAccount(storedAccountOf(renewed)),
        needsAttention: context.needsAttention,
        log: context.log,
      });
      const specs = new SpecStore({
        fetch: dependencies.fetch,
        baseUrl: dependencies.specBaseUrl,
        directory: context.dataDirectory,
        log: context.log,
      });
      return Promise.resolve(
        new XiaomiAdapter({
          dependencies,
          cloud,
          specs,
          userId: secrets.userId,
          motor,
          log: context.log,
        }),
      );
    },
  };
}
