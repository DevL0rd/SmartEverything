import * as SecureStore from 'expo-secure-store';
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { z } from 'zod';
import { HUB_CONNECTION_METADATA, type HubConnectionMetadata } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { appPlatform } from '../../design/platform';
import { jsonText } from '../../format/json-text';
import type { ServerConnection } from './storage';
import { HubRouteUnavailableError } from './route-policy';

const log = new Logger('app.hub-route');
const KEY = 'smarteverything.server.trusted-hub';
const CACHED = z.object({
  enrollment: z.string().regex(/^[a-f0-9]{64}$/),
  metadata: HUB_CONNECTION_METADATA,
});

function noteCacheRead(sameHub: boolean, sameEnrollment: boolean): void {
  log.debug('trust.cache_read', {
    outcome: sameHub && sameEnrollment ? 'hit' : 'mismatch',
    sameHub,
    sameEnrollment,
  });
}

async function readCache(connection: ServerConnection): Promise<HubConnectionMetadata | null> {
  const text =
    appPlatform() === 'android'
      ? await SecureStore.getItemAsync(KEY)
      : window.localStorage.getItem(KEY);
  if (text === null) return null;
  const json = jsonText(text);
  const parsed = json.ok ? CACHED.safeParse(json.value) : null;
  if (parsed?.success !== true) {
    log.warn('trust.cache_unreadable', { textLength: text.length });
    await forgetHubTrust();
    return null;
  }
  const paired = connection.trustedMetadata;
  const sameHub = paired === undefined || paired.identity.id === parsed.data.metadata.identity.id;
  const sameEnrollment = parsed.data.enrollment === (await enrollmentOf(connection));
  noteCacheRead(sameHub, sameEnrollment);
  return sameHub && sameEnrollment ? parsed.data.metadata : null;
}

export async function readHubTrust(
  connection: ServerConnection,
): Promise<HubConnectionMetadata | null> {
  const cached = await readCache(connection);
  if (cached !== null) return cached;
  return connection.trustedMetadata === undefined
    ? null
    : HUB_CONNECTION_METADATA.parse(connection.trustedMetadata);
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

export async function fetchHubMetadata(
  connection: ServerConnection,
  baseUrl: string,
  send: (url: string, init: RequestInit) => Promise<Response>,
): Promise<HubConnectionMetadata> {
  const response = await send(`${baseUrl}/api/connection`, {
    method: 'GET',
    headers: { authorization: `Bearer ${connection.token}` },
  });
  if (!response.ok)
    throw new HubRouteUnavailableError(
      `Trusted hub metadata returned HTTP ${String(response.status)}.`,
    );
  return HUB_CONNECTION_METADATA.parse(await response.json());
}

export function sameHubInventory(
  left: HubConnectionMetadata,
  right: HubConnectionMetadata,
): boolean {
  const known = new Set(right.endpoints.map((endpoint) => `${endpoint.kind} ${endpoint.url}`));
  return (
    left.identity.tls.certificateSha256 === right.identity.tls.certificateSha256 &&
    left.endpoints.length === right.endpoints.length &&
    left.endpoints.every((endpoint) => known.has(`${endpoint.kind} ${endpoint.url}`))
  );
}

function enrollmentOf(connection: ServerConnection): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, `${connection.url} ${connection.token}`);
}
