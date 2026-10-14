import { z } from 'zod';
import { join } from 'node:path';
import { CLIENT_TOKEN } from '@smarteverything/domain';
import {
  RUNNING_SERVICE_READY,
  type ServiceReady,
} from '@smarteverything/hub/service/configuration';
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
  const parsed = RUNNING_SERVICE_READY.safeParse(json);
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

export function readyUrl(ready: ServiceReady): string {
  return 'role' in ready ? ready.hub_url : ready.url;
}

const NODE_WINDOW = z.strictObject({
  hub_url: z.url({ protocol: /^https?$/ }),
  token: CLIENT_TOKEN,
});
export async function readNodeWindow(
  system: ServiceSystem,
  locations: ServiceLocations,
  hubUrl: string,
): Promise<{ readonly url: string; readonly token: string }> {
  const text = await system.files.read(join(locations.dataDirectory, 'node-window.json'));
  if (text === null) throw new NodeWindowPairingError();
  const value: unknown = JSON.parse(text);
  const paired = NODE_WINDOW.parse(value);
  if (new URL(paired.hub_url).origin !== new URL(hubUrl).origin) throw new NodeWindowPairingError();
  return { url: hubUrl, token: paired.token };
}
class NodeWindowPairingError extends Error {
  override readonly name = 'NodeWindowPairingError';
  constructor() {
    super(
      'Pair this desktop window separately: create an app pairing code in the hub, then run the packaged service entry with --pair-node-window --hub <hub URL> --code <app code>. The node service credential cannot sign into the window.',
    );
  }
}
