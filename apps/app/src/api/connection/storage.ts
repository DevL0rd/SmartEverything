import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import { CLIENT_TOKEN } from '@smarteverything/domain';
import { desktopBridge } from '../../design/platform';
import { jsonText } from '../../format/json-text';

const SERVER_CONNECTION = z.strictObject({
  url: z.url({ protocol: /^https?$/ }),
  token: CLIENT_TOKEN,
});

export type ServerConnection = z.infer<typeof SERVER_CONNECTION>;

export type StoredKind = 'phone' | 'browser';

const STORAGE_KEY = 'smarteverything.server';

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
  if (kind === 'phone') {
    return parsedConnection('secure storage', await SecureStore.getItemAsync(STORAGE_KEY));
  }
  return parsedConnection('this browser', window.localStorage.getItem(STORAGE_KEY));
}

export async function storeConnection(
  kind: StoredKind,
  connection: ServerConnection,
): Promise<void> {
  const text = JSON.stringify(SERVER_CONNECTION.parse(connection));
  if (kind === 'phone') {
    await SecureStore.setItemAsync(STORAGE_KEY, text);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, text);
}

export async function forgetConnection(kind: StoredKind): Promise<void> {
  if (kind === 'phone') {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
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
  const parsed = SERVER_CONNECTION.safeParse(await bridge.server());
  if (!parsed.success) {
    throw new DesktopServerError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; '),
    );
  }
  return { url: parsed.data.url.replace(/\/+$/, ''), token: parsed.data.token };
}
