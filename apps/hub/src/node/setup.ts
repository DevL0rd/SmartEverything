import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { API_ENDPOINTS, CLIENT_TOKEN } from '@smarteverything/domain';
import { SERVICE_CONFIG_FILE, NODE_SERVICE_CONFIG } from '../service/configuration';
import { nodeIdentity } from './identity';

async function claim(url: string, path: string, body: unknown): Promise<unknown> {
  const response = await fetch(new URL(path, url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new NodeSetupError(`The hub refused pairing (HTTP ${String(response.status)}).`);
  return response.json();
}
async function protectedFile(directory: string, name: string, value: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, name);
  await writeFile(`${file}.tmp`, value, { mode: 0o600 });
  await rename(`${file}.tmp`, file);
}

export async function pairNode(options: {
  readonly dataDirectory: string;
  readonly hubUrl: string;
  readonly code: string;
}): Promise<void> {
  const endpoint = API_ENDPOINTS.claimComputerNode;
  const body = endpoint.body.parse({
    code: options.code,
    hello: await nodeIdentity(options.dataDirectory),
  });
  const paired = endpoint.response.parse(await claim(options.hubUrl, endpoint.path, body));
  if (new URL(paired.hub_url).origin !== new URL(options.hubUrl).origin) {
    throw new NodeSetupError('The pairing response redirected the node to a different hub origin.');
  }
  const config = NODE_SERVICE_CONFIG.parse({
    role: 'node',
    node: {
      hub_url: paired.hub_url,
      node_token: paired.token,
      device_id: paired.device_id,
    },
  });
  await protectedFile(
    options.dataDirectory,
    SERVICE_CONFIG_FILE,
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

export async function pairNodeWindow(options: {
  readonly dataDirectory: string;
  readonly hubUrl: string;
  readonly code: string;
}): Promise<void> {
  const endpoint = API_ENDPOINTS.claimPairing;
  const body = endpoint.body.parse({
    code: options.code,
    name: `${hostname()} desktop`,
    platform: 'web',
  });
  const paired = endpoint.response.parse(await claim(options.hubUrl, endpoint.path, body));
  await protectedFile(
    options.dataDirectory,
    'node-window.json',
    JSON.stringify({
      hub_url: new URL(options.hubUrl).origin,
      token: CLIENT_TOKEN.parse(paired.token),
    }),
  );
}
class NodeSetupError extends Error {
  override readonly name = 'NodeSetupError';
}
