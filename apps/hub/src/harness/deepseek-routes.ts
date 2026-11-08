import {
  AI_DEEPSEEK_ENDPOINTS as E,
  DEEPSEEK_KEY_REFERENCE,
  type DeepSeekStatus,
} from '@smarteverything/domain';
import type { ApiKeyVault } from '@smarteverything/harness';
import { bound, type Routes } from '../server/router';

async function statusOf(vault: ApiKeyVault): Promise<DeepSeekStatus> {
  return { key: (await vault.read(DEEPSEEK_KEY_REFERENCE)) === undefined ? 'missing' : 'set' };
}

export function deepSeekRoutes(vault: ApiKeyVault): Routes<keyof typeof E> {
  return {
    readDeepSeek: bound(E.readDeepSeek, () => statusOf(vault)),
    setDeepSeekKey: bound(E.setDeepSeekKey, async ({ body }) => {
      await vault.write(DEEPSEEK_KEY_REFERENCE, body.key);
      return statusOf(vault);
    }),
    removeDeepSeekKey: bound(E.removeDeepSeekKey, async () => {
      await vault.remove(DEEPSEEK_KEY_REFERENCE);
      return statusOf(vault);
    }),
  };
}
