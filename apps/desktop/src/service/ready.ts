import {
  COMPUTER_SERVICE_READY,
  COMPUTER_WINDOW_CONNECTION,
  type ComputerServiceReady,
  type DesktopServer,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { ServiceLocations } from './locations.js';
import { PRIVATE_MODE } from './manager.js';
import type { ServiceSystem } from './system.js';

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
): Promise<ComputerServiceReady | null> {
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
  const parsed = COMPUTER_SERVICE_READY.safeParse(json);
  if (!parsed.success) {
    throw new ServiceFileInvalidError(
      locations.readyFile,
      'the pid, URL and version of the running Computer service',
      text.trim(),
    );
  }
  const alive = system.isAlive(parsed.data.pid);
  log.trace('service.ready_read', { pid: parsed.data.pid, alive });
  return alive ? parsed.data : null;
}

export function desktopConnectionFile(locations: ServiceLocations): string {
  return locations.connectionFile;
}

export async function readDesktopConnection(
  system: ServiceSystem,
  locations: ServiceLocations,
): Promise<DesktopServer | null> {
  const file = desktopConnectionFile(locations);
  const text = await system.files.read(file);
  if (text === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error: unknown) {
    throw new ServiceFileInvalidError(file, 'JSON', String(error));
  }
  const { hub_url: url, ...connection } = COMPUTER_WINDOW_CONNECTION.parse(json);
  return { url, ...connection };
}

export async function writeDesktopConnection(
  system: ServiceSystem,
  locations: ServiceLocations,
  window: DesktopServer | null,
): Promise<void> {
  const file = desktopConnectionFile(locations);
  if (window === null) {
    await system.files.remove(file);
    return;
  }
  const { url, ...connection } = window;
  const paired = COMPUTER_WINDOW_CONNECTION.parse({ ...connection, hub_url: new URL(url).origin });
  await system.files.write(file, JSON.stringify(paired), PRIVATE_MODE);
}
