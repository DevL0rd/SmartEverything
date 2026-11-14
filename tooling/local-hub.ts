import { readFile } from 'node:fs/promises';
import { CLIENT_TOKEN } from '@smarteverything/domain';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import { SERVICE_READY } from '../apps/hub/src/service/configuration.ts';
import type { PublisherTarget } from './machine-update-client.ts';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export type LocalHubLayout = Pick<HubLayout, 'system'>;

export class LocalHubNotRunningError extends Error {
  override readonly name = 'LocalHubNotRunningError';

  constructor(file: string) {
    super(`The hub is not running on this machine: ${file} does not exist.`);
  }
}

export class LocalHubAddressError extends Error {
  override readonly name = 'LocalHubAddressError';

  constructor(address: string) {
    super(`The hub announces ${address}; publishing requires its loopback http listener.`);
  }
}

export class LocalHubTokenError extends Error {
  override readonly name = 'LocalHubTokenError';

  constructor(file: string) {
    super(`${file} must hold one owner client token and nothing else.`);
  }
}

async function readText(file: string, missing: () => Error): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (cause: unknown) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') throw missing();
    throw cause;
  }
}

export async function localHub(layout: LocalHubLayout): Promise<PublisherTarget> {
  const readyFile = layout.system.run.ready;
  const ready = SERVICE_READY.parse(
    JSON.parse(await readText(readyFile, () => new LocalHubNotRunningError(readyFile))),
  );
  const url = new URL(ready.url);
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname))
    throw new LocalHubAddressError(ready.url);
  const tokenFile = layout.system.keys.ownerToken;
  const token = (await readText(tokenFile, () => new LocalHubTokenError(tokenFile))).trim();
  if (!CLIENT_TOKEN.safeParse(token).success) throw new LocalHubTokenError(tokenFile);
  return { url, token };
}
