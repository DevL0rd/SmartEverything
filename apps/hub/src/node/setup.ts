import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  API_ENDPOINTS,
  COMPUTER_SERVICE_CONFIG,
  NODE_CONNECTION_PATH,
  NODE_CONNECTION_RESPONSE,
} from '@smarteverything/domain';
import { canonicalEndpoint, routeConfiguration } from '../client-network/route-trust';
import { NodeRouteStore } from '../client-network/route-store';
import type { NodeLayout } from '../data-layout';
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
async function protectedFile(file: string, value: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(`${file}.tmp`, value, { mode: 0o600 });
  await rename(`${file}.tmp`, file);
}

export async function pairNode(options: {
  readonly layout: NodeLayout;
  readonly hubUrl: string;
  readonly code: string;
  readonly pin?: string | undefined;
  readonly windowToken?: string | undefined;
}): Promise<void> {
  canonicalEndpoint(options.hubUrl);
  const fetcher = hubFetch(options.pin);
  const endpoint = API_ENDPOINTS.claimComputerNode;
  const body = endpoint.body.parse({
    code: options.code,
    hello: await nodeIdentity(options.layout.computerNodeId),
    ...(options.windowToken === undefined ? {} : { window_token: options.windowToken }),
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
    await enrolRoute(options.layout.nodeRoute, fetcher, paired.hub_url, paired.token);
  const config = COMPUTER_SERVICE_CONFIG.parse({
    node: { hub_url: paired.hub_url, node_token: paired.token, device_id: paired.device_id },
  });
  await protectedFile(options.layout.config, `${JSON.stringify(config, null, 2)}\n`);
}

async function enrolRoute(
  routeFile: string,
  fetcher: Fetch,
  hubUrl: string,
  token: string,
): Promise<void> {
  const answer = NODE_CONNECTION_RESPONSE.parse(
    await exchange(fetcher, new URL(NODE_CONNECTION_PATH, hubUrl), {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
  await new NodeRouteStore(routeFile, token).write(
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
