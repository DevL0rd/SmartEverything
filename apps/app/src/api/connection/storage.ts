import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import { CLIENT_TOKEN, HUB_CONNECTION_METADATA } from '@smarteverything/domain';
import { desktopBridge, type DesktopBridge } from '../../design/platform';
import { jsonText } from '../../format/json-text';

const SERVER_CONNECTION = z
  .strictObject({
    url: z.url({ protocol: /^https?$/ }),
    token: CLIENT_TOKEN,
    canonicalKind: z.enum(['loopback', 'lan', 'remote']).optional(),
    trustedMetadata: HUB_CONNECTION_METADATA.optional(),
  })
  .refine(
    (connection) =>
      connection.trustedMetadata === undefined ||
      connection.trustedMetadata.endpoints.some(
        (endpoint) => endpoint.url === connection.url && endpoint.kind === connection.canonicalKind,
      ),
    'Saved hub credentials, canonical endpoint kind and trusted metadata must belong to one enrollment',
  );

const DESKTOP_CONNECTION = SERVER_CONNECTION.strip();

export type ServerConnection = z.infer<typeof SERVER_CONNECTION>;

export type StoredKind = 'phone' | 'browser' | 'desktop';

const STORAGE_KEY = 'smarteverything.server';
let writing: Promise<void> = Promise.resolve();

function serializeWrite(action: () => Promise<void>): Promise<void> {
  const next = writing.then(action, action);
  writing = next;
  return next;
}

const REMOTE_KEY = 'smarteverything.server.remote';

class StoredConnectionError extends Error {
  override readonly name = 'StoredConnectionError';

  constructor(
    readonly where: string,
    readonly issues: string,
  ) {
    super(
      `The saved server connection in ${where} is unreadable: ${issues}. Unpair and pair again.`,
    );
  }
}

class DesktopBridgeMissingError extends Error {
  override readonly name = 'DesktopBridgeMissingError';

  constructor() {
    super('This pairing belongs to the desktop app window, and the desktop app is not here.');
  }
}

class DesktopServerError extends Error {
  override readonly name = 'DesktopServerError';

  constructor(readonly issues: string) {
    super(`The desktop app handed over an unusable server connection: ${issues}.`);
  }
}

function jsonOf(where: string, text: string): unknown {
  const read = jsonText(text);
  if (!read.ok) {
    throw new StoredConnectionError(where, read.reason);
  }
  return read.value;
}

function parsedConnection(where: string, text: string | null): ServerConnection | null {
  if (text === null) {
    return null;
  }
  const parsed = SERVER_CONNECTION.safeParse(jsonOf(where, text));
  if (!parsed.success) {
    throw new StoredConnectionError(
      where,
      parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; '),
    );
  }
  return parsed.data;
}

export async function readStoredConnection(kind: StoredKind): Promise<ServerConnection | null> {
  if (kind === 'desktop') return desktopConnection();
  if (kind === 'phone') {
    return parsedConnection('secure storage', await SecureStore.getItemAsync(STORAGE_KEY));
  }
  return parsedConnection('this browser', window.localStorage.getItem(STORAGE_KEY));
}

export async function storeConnection(
  kind: StoredKind,
  connection: ServerConnection,
  isCurrent: () => boolean = (): boolean => true,
): Promise<void> {
  const text = JSON.stringify(SERVER_CONNECTION.parse(connection));
  await serializeWrite(async (): Promise<void> => {
    if (!isCurrent()) return;
    if (kind === 'desktop')
      await requiredBridge().setWindow({ url: connection.url, token: connection.token });
    else if (kind === 'phone') await SecureStore.setItemAsync(STORAGE_KEY, text);
    else window.localStorage.setItem(STORAGE_KEY, text);
  });
}

export async function forgetStoredEnrollment(
  kind: StoredKind,
  connection: ServerConnection,
): Promise<void> {
  await serializeWrite(async (): Promise<void> => {
    const stored = await readStoredConnection(kind);
    if (stored?.token !== connection.token || stored.url !== connection.url) return;
    await removeStored(kind);
  });
}

async function removeStored(kind: StoredKind): Promise<void> {
  if (kind === 'desktop') await requiredBridge().setWindow(null);
  else if (kind === 'phone') await SecureStore.deleteItemAsync(STORAGE_KEY);
  else window.localStorage.removeItem(STORAGE_KEY);
}

function requiredBridge(): DesktopBridge {
  const bridge = desktopBridge();
  if (bridge === null) throw new DesktopBridgeMissingError();
  return bridge;
}

export async function forgetConnection(kind: StoredKind): Promise<void> {
  await serializeWrite(() => removeStored(kind));
}

export function prefersRemoteServer(): boolean {
  return window.localStorage.getItem(REMOTE_KEY) === 'true';
}

export function preferRemoteServer(remote: boolean): void {
  if (remote) {
    window.localStorage.setItem(REMOTE_KEY, 'true');
    return;
  }
  window.localStorage.removeItem(REMOTE_KEY);
}

export async function desktopConnection(): Promise<ServerConnection | null> {
  const bridge = desktopBridge();
  if (bridge === null) {
    return null;
  }
  const server = await bridge.server();
  if (server === null) {
    return null;
  }
  const parsed = DESKTOP_CONNECTION.safeParse(server);
  if (!parsed.success) {
    throw new DesktopServerError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; '),
    );
  }
  return { url: parsed.data.url.replace(/\/+$/, ''), token: parsed.data.token };
}
