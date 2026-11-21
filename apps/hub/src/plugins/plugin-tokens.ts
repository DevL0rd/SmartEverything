import { createMcpToken, hashMcpToken, type PluginRow } from '@smarteverything/domain';
import type { Store } from '../store/store';

const CALLBACK_URL_VARIABLE = 'SMARTEVERYTHING_MCP_URL';

const CALLBACK_TOKEN_VARIABLE = 'SMARTEVERYTHING_TOKEN';

export async function callbackFor(
  store: Pick<Store, 'host'>,
  row: PluginRow,
  mcpUrl: string,
): Promise<Readonly<Record<string, string>>> {
  const token = createMcpToken();
  await store.host.call(
    'plugins',
    'saveToken',
    row.id,
    hashMcpToken(token),
    row.manifest.permissions.seAreas,
  );
  return { [CALLBACK_URL_VARIABLE]: mcpUrl, [CALLBACK_TOKEN_VARIABLE]: token };
}
