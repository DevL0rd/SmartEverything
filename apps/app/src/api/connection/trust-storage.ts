import * as SecureStore from 'expo-secure-store';
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { z } from 'zod';
import { HUB_CONNECTION_METADATA, type HubConnectionMetadata } from '@smarteverything/domain';
import { appPlatform } from '../../design/platform';
import { jsonText } from '../../format/json-text';
import type { ServerConnection } from './storage';
import { HubRouteUnavailableError } from './route-policy';

const KEY = 'smarteverything.server.trusted-hub';
const CACHED = z.object({
  enrollment: z.string().regex(/^[a-f0-9]{64}$/),
  metadata: HUB_CONNECTION_METADATA,
});

export async function readHubTrust(
  connection: ServerConnection,
): Promise<HubConnectionMetadata | null> {
  if (connection.trustedMetadata !== undefined)
    return HUB_CONNECTION_METADATA.parse(connection.trustedMetadata);
  const text =
    appPlatform() === 'android'
      ? await SecureStore.getItemAsync(KEY)
      : window.localStorage.getItem(KEY);
  if (text === null) return null;
  const json = jsonText(text);
  const parsed = json.ok ? CACHED.safeParse(json.value) : null;
  if (parsed?.success !== true)
    throw new HubRouteUnavailableError(
      'Saved hub trust is unreadable; trusted metadata must be refreshed.',
    );
  return parsed.data.enrollment === (await enrollmentOf(connection)) ? parsed.data.metadata : null;
}

export async function rememberHubTrust(
  connection: ServerConnection,
  metadata: HubConnectionMetadata,
): Promise<void> {
  const text = JSON.stringify(
    CACHED.parse({ enrollment: await enrollmentOf(connection), metadata }),
  );
  if (appPlatform() === 'android') await SecureStore.setItemAsync(KEY, text);
  else window.localStorage.setItem(KEY, text);
}

export async function forgetHubTrust(): Promise<void> {
  if (appPlatform() === 'android') await SecureStore.deleteItemAsync(KEY);
  else window.localStorage.removeItem(KEY);
}

function enrollmentOf(connection: ServerConnection): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, `${connection.url} ${connection.token}`);
}
