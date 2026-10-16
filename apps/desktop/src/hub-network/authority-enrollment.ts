import { z } from 'zod';
import { isIP } from 'node:net';
import {
  CLIENT_TOKEN,
  HUB_CONNECTION_METADATA,
  hashClientToken,
  NATIVE_HUB_ROUTE_CONFIGURATION,
  type NativeHubRouteConfiguration,
  type HubConnectionMetadata,
  type HubEndpoint,
} from '@smarteverything/domain';
import { readPrivateServiceFile } from './authority-view.js';
import { HubPolicies, HubTransportError } from './policy.js';
import { streamHubFetch } from '../../../hub/src/client-network/stream-fetch';
import {
  readRouteDocument,
  ROUTE_DOCUMENT_BYTES,
  ROUTE_PROBE_TIMEOUT_MS,
} from '../../../hub/src/client-network/route-probes';
const WINDOW = z.strictObject({ hub_url: z.url({ protocol: /^https?$/ }), token: CLIENT_TOKEN });
export interface DesktopClientEnrollment {
  readonly configuration: NativeHubRouteConfiguration;
  readonly token: string;
  readonly metadata: HubConnectionMetadata;
}
export async function enrollDesktopClient(
  directory: string,
  value: unknown,
  signal: AbortSignal,
): Promise<DesktopClientEnrollment> {
  const configuration = NATIVE_HUB_ROUTE_CONFIGURATION.parse(value);
  const window = WINDOW.parse(
    JSON.parse(await readPrivateServiceFile(directory, 'node-window.json')),
  );
  if (
    new URL(window.hub_url).origin !== configuration.canonicalOrigin ||
    configuration.bindings.length !== 1
  )
    throw new HubTransportError('Window pairing differs from the requested canonical authority');
  const binding = configuration.bindings[0];
  if (binding?.credentialKind !== 'client' || binding.principalId !== hashClientToken(window.token))
    throw new HubTransportError('Window credential principal is not independently paired');
  const canonical = new URL(configuration.canonicalOrigin);
  if (
    canonical.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(canonical.hostname)
  )
    throw new HubTransportError(
      'Client enrollment requires independently verified canonical HTTPS',
    );
  const response = await fetch(new URL('/api/connection', canonical), {
    headers: { authorization: `Bearer ${window.token}` },
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(ROUTE_PROBE_TIMEOUT_MS)]),
  });
  if (!response.ok)
    throw new HubTransportError(
      `Canonical client enrollment refused (HTTP ${String(response.status)})`,
    );
  const metadata = HUB_CONNECTION_METADATA.parse(
    JSON.parse((await readRouteDocument(response, ROUTE_DOCUMENT_BYTES * 4)).body),
  );
  if (JSON.stringify(metadata.identity) !== JSON.stringify(configuration.trust.identity))
    throw new HubTransportError(
      'Renderer trust differs from independently authenticated client identity',
    );
  return { configuration, token: window.token, metadata };
}

export async function refreshDesktopEndpoint(
  enrollment: DesktopClientEnrollment,
  endpoint: HubEndpoint,
  signal: AbortSignal,
): Promise<DesktopClientEnrollment> {
  const previous = enrollment.configuration;
  const address = new URL(endpoint.url).hostname.replace(/^\[|\]$/g, '');
  if (endpoint.kind !== 'lan' || isIP(address) === 0)
    throw new HubTransportError('Client endpoint refresh requires a literal LAN candidate');
  const endpoints = previous.trust.endpoints.filter((entry) => entry.url !== endpoint.url);
  if (endpoints.length >= 32) {
    const oldest = endpoints.findIndex(
      (entry) => entry.kind === 'lan' && entry.url !== previous.canonicalOrigin,
    );
    if (oldest < 0) throw new HubTransportError('Client route inventory has no LAN slot');
    endpoints.splice(oldest, 1);
  }
  const configuration = NATIVE_HUB_ROUTE_CONFIGURATION.parse({
    ...previous,
    trust: {
      ...previous.trust,
      endpoints: [...endpoints, endpoint],
      lanAddresses: [...new Set([...previous.trust.lanAddresses, address])].slice(-32),
    },
  });
  const policies = new HubPolicies();
  try {
    policies.configure(configuration.trust);
    const url = new URL('/api/connection', endpoint.url).href;
    const lease = policies.lease(configuration.trust.scopeId, url);
    const request = new Request(url, { headers: { authorization: `Bearer ${enrollment.token}` } });
    const response = await streamHubFetch(request, {
      ...lease,
      signal: AbortSignal.any([signal, AbortSignal.timeout(ROUTE_PROBE_TIMEOUT_MS)]),
    });
    return await refreshedEnrollment(enrollment, configuration, endpoint, response);
  } finally {
    policies.close();
  }
}

async function refreshedEnrollment(
  enrollment: DesktopClientEnrollment,
  configuration: NativeHubRouteConfiguration,
  endpoint: HubEndpoint,
  response: Response,
): Promise<DesktopClientEnrollment> {
  if (!response.ok) throw new HubTransportError('Client endpoint enrollment was refused');
  const metadata = HUB_CONNECTION_METADATA.parse(
    JSON.parse((await readRouteDocument(response, ROUTE_DOCUMENT_BYTES * 4)).body),
  );
  if (
    JSON.stringify(metadata.identity) !== JSON.stringify(enrollment.metadata.identity) ||
    !metadata.endpoints.some((entry) => entry.kind === endpoint.kind && entry.url === endpoint.url)
  )
    throw new HubTransportError(
      'Client endpoint differs from independently authenticated inventory',
    );
  return { configuration, metadata, token: enrollment.token };
}
