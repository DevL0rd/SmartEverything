import { CLIENT_TOKEN } from '@smarteverything/domain';
import { SERVICE_READY, type ServiceReady } from '@smarteverything/hub/service/configuration';
import type { ServiceLocations } from './locations.js';
import type { ServiceSystem } from './system.js';

const STATUS_TIMEOUT_MS = 3000;

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
  const parsed = SERVICE_READY.safeParse(json);
  if (!parsed.success) {
    throw new ServiceFileInvalidError(
      locations.readyFile,
      'the pid, URL and version of the running server',
      text.trim(),
    );
  }
  return system.isAlive(parsed.data.pid) ? parsed.data : null;
}

export async function answers(system: ServiceSystem, url: string): Promise<boolean> {
  try {
    const response = await system.fetch(new URL('/status', url), {
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    return response.ok;
  } catch (error: unknown) {
    if (error instanceof Error) {
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
