import { join } from 'node:path';
import { CLIENT_TOKEN, type DesktopServer } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  NODE_WINDOW,
  NODE_WINDOW_FILE,
  RUNNING_SERVICE_READY,
  type ServiceReady,
} from '@smarteverything/hub/service/configuration';
import type { ServiceLocations } from './locations.js';
import { PRIVATE_MODE } from './manager.js';
import type { ServiceSystem } from './system.js';

const STATUS_TIMEOUT_MS = 3000;

const log = new Logger('desktop.service');

export class ServiceFileInvalidError extends Error {
  readonly file: string;

  constructor(file: string, expected: string, received: string) {
    super(`${file} must hold ${expected}; received ${received}`);
    this.name = 'ServiceFileInvalidError';
    this.file = file;
  }
}

export async function readReady(
  system: ServiceSystem,
  locations: ServiceLocations,
): Promise<ServiceReady | null> {
  const text = await system.files.read(locations.readyFile);
  if (text === null) {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error: unknown) {
    throw new ServiceFileInvalidError(locations.readyFile, 'JSON', String(error));
  }
  const parsed = RUNNING_SERVICE_READY.safeParse(json);
  if (!parsed.success) {
    throw new ServiceFileInvalidError(
      locations.readyFile,
      'the pid, URL and version of the running server',
      text.trim(),
    );
  }
  const alive = system.isAlive(parsed.data.pid);
  log.trace('service.ready_read', { pid: parsed.data.pid, alive });
  return alive ? parsed.data : null;
}

export async function answers(system: ServiceSystem, url: string): Promise<boolean> {
  try {
    const response = await system.fetch(new URL('/status', url), {
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    log.trace('service.status_answered', { status: response.status });
    return response.ok;
  } catch (error: unknown) {
    if (error instanceof Error) {
      log.debug('service.status_unanswered', { reason: error.name });
      return false;
    }
    throw error;
  }
}

export class OwnerTokenMissingError extends Error {
  readonly file: string;

  constructor(file: string, received: string) {
    super(
      `the server writes the desktop's owner token to ${file} when it starts; received ${received}`,
    );
    this.name = 'OwnerTokenMissingError';
    this.file = file;
  }
}

export async function readOwnerToken(
  system: ServiceSystem,
  locations: ServiceLocations,
): Promise<string> {
  const text = await system.files.read(locations.ownerTokenFile);
  if (text === null) {
    throw new OwnerTokenMissingError(locations.ownerTokenFile, 'no file');
  }
  const parsed = CLIENT_TOKEN.safeParse(text.trim());
  if (!parsed.success) {
    throw new OwnerTokenMissingError(locations.ownerTokenFile, 'a file without a valid token');
  }
  return parsed.data;
}

export function readyUrl(ready: ServiceReady): string {
  return 'role' in ready ? ready.hub_url : ready.url;
}

export function nodeWindowFile(locations: ServiceLocations): string {
  return join(locations.dataDirectory, NODE_WINDOW_FILE);
}

export async function readNodeWindow(
  system: ServiceSystem,
  locations: ServiceLocations,
): Promise<DesktopServer | null> {
  const file = nodeWindowFile(locations);
  const text = await system.files.read(file);
  if (text === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error: unknown) {
    throw new ServiceFileInvalidError(file, 'JSON', String(error));
  }
  const paired = NODE_WINDOW.parse(json);
  return { url: paired.hub_url, token: paired.token };
}

export async function writeNodeWindow(
  system: ServiceSystem,
  locations: ServiceLocations,
  window: DesktopServer | null,
): Promise<void> {
  const file = nodeWindowFile(locations);
  if (window === null) {
    await system.files.remove(file);
    return;
  }
  const paired = NODE_WINDOW.parse({ hub_url: new URL(window.url).origin, token: window.token });
  await system.files.write(file, JSON.stringify(paired), PRIVATE_MODE);
}
