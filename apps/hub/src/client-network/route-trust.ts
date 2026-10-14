import { isIP } from 'node:net';
import {
  NODE_CONNECTION_PATH,
  NODE_CONNECTION_RESPONSE,
  NATIVE_HUB_ROUTE_CONFIGURATION,
  type NativeHubRouteConfiguration,
  type HubEndpoint,
} from '@smarteverything/domain';
import { HubTransportError } from './policy';
import { readRouteDocument, ROUTE_PROBE_TIMEOUT_MS, ROUTE_DOCUMENT_BYTES } from './route-probes';

export class NodeEnrollmentRefusedError extends Error {
  override readonly name = 'NodeEnrollmentRefusedError';
  constructor(readonly status: number) {
    super(`Canonical hub refused node enrollment (HTTP ${String(status)})`);
  }
}
export interface NodeRouteIdentity {
  readonly hubUrl: string;
  readonly deviceId: string;
  readonly token: string;
}
export function canonicalEndpoint(hubUrl: string): HubEndpoint {
  const url = new URL(hubUrl);
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '')
    throw new HubTransportError('Canonical hub URL contains credentials, query or fragment');
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    return { kind: 'loopback', url: url.origin };
  if (url.protocol !== 'https:') throw new HubTransportError('A remote node hub requires HTTPS');
  return { kind: 'remote', url: url.origin };
}
export async function bootstrapNodeTrust(
  identity: NodeRouteIdentity,
): Promise<NativeHubRouteConfiguration | null> {
  const canonical = canonicalEndpoint(identity.hubUrl);
  if (new URL(canonical.url).protocol !== 'https:') return null;
  const response = await fetch(new URL(NODE_CONNECTION_PATH, canonical.url), {
    headers: { authorization: `Bearer ${identity.token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(ROUTE_PROBE_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403)
    throw new NodeEnrollmentRefusedError(response.status);
  if (response.status === 404 || response.status === 503) return null;
  if (!response.ok)
    throw new HubTransportError(`Node trust bootstrap refused (HTTP ${String(response.status)})`);
  const answer = NODE_CONNECTION_RESPONSE.parse(
    JSON.parse((await readRouteDocument(response, ROUTE_DOCUMENT_BYTES * 4)).body),
  );
  if (answer.device_id !== identity.deviceId) throw new NodeEnrollmentRefusedError(403);
  const scopeId = `node:${identity.deviceId}`;
  const endpoints = new Map<string, HubEndpoint>(
    answer.connection.endpoints
      .filter((endpoint) => endpoint.kind !== 'loopback')
      .map((endpoint) => [new URL(endpoint.url).origin, endpoint]),
  );
  endpoints.set(canonical.url, canonical);
  return NATIVE_HUB_ROUTE_CONFIGURATION.parse({
    canonicalOrigin: canonical.url,
    trust: {
      scopeId,
      identity: answer.connection.identity,
      endpoints: [...endpoints.values()],
      lanAddresses: [...endpoints.values()].flatMap((endpoint) => {
        const hostname = new URL(endpoint.url).hostname.replace(/^\[|\]$/g, '');
        return endpoint.kind === 'lan' && isIP(hostname) > 0 ? [hostname] : [];
      }),
    },
    bindings: [
      {
        scopeId,
        canonicalOrigin: canonical.url,
        hubId: answer.connection.identity.id,
        principalId: identity.deviceId,
        credentialKind: 'node',
        credentialGeneration: 0,
      },
    ],
  });
}
