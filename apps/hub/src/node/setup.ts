import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  API_ENDPOINTS,
  NODE_CONNECTION_PATH,
  NODE_CONNECTION_RESPONSE,
} from '@smarteverything/domain';
import { canonicalEndpoint, routeConfiguration } from '../client-network/route-trust';
import { NodeRouteStore } from '../client-network/route-store';
import {
  NODE_SERVICE_CONFIG,
  NODE_WINDOW,
  NODE_WINDOW_FILE,
  SERVICE_CONFIG_FILE,
} from '../service/configuration';
import { nodeIdentity } from './identity';
import { hubFetch } from './pinned-fetch';

type Fetch = ReturnType<typeof hubFetch>;

async function exchange(fetcher: Fetch, url: URL, init: Parameters<Fetch>[1]): Promise<unknown> {
  const response = await fetcher(url, {
    ...init,
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
  readonly pin?: string | undefined;
}): Promise<void> {
  canonicalEndpoint(options.hubUrl);
  const fetcher = hubFetch(options.pin);
  const endpoint = API_ENDPOINTS.claimComputerNode;
  const body = endpoint.body.parse({
    code: options.code,
    hello: await nodeIdentity(options.dataDirectory),
  });
  const paired = endpoint.response.parse(
    await exchange(fetcher, new URL(endpoint.path, options.hubUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  const origin = new URL(paired.hub_url).origin;
  if (origin !== new URL(options.hubUrl).origin) {
    throw new NodeSetupError('The pairing response redirected the node to a different hub origin.');
  }
  if (origin.startsWith('https:'))
    await enrolRoute(options.dataDirectory, fetcher, paired.hub_url, paired.token);
  const config = NODE_SERVICE_CONFIG.parse({
    role: 'node',
    node: { hub_url: paired.hub_url, node_token: paired.token, device_id: paired.device_id },
  });
  await protectedFile(
    options.dataDirectory,
    NODE_WINDOW_FILE,
    JSON.stringify(NODE_WINDOW.parse({ hub_url: origin, token: paired.window_token })),
  );
  await protectedFile(
    options.dataDirectory,
    SERVICE_CONFIG_FILE,
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

async function enrolRoute(
  dataDirectory: string,
  fetcher: Fetch,
  hubUrl: string,
  token: string,
): Promise<void> {
  const answer = NODE_CONNECTION_RESPONSE.parse(
    await exchange(fetcher, new URL(NODE_CONNECTION_PATH, hubUrl), {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
  await new NodeRouteStore(dataDirectory, token).write(
    routeConfiguration(
      { hubUrl, deviceId: answer.device_id, token },
      canonicalEndpoint(hubUrl),
      answer,
    ),
  );
}

class NodeSetupError extends Error {
  override readonly name = 'NodeSetupError';
}
