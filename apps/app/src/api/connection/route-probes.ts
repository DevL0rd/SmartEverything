import {
  HUB_PUBLIC_IDENTITY,
  HUB_IDENTITY_PATH,
  type HubEndpoint,
  type HubConnectionMetadata,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { pinnedFetch } from './route-platform';
import { MAX_PROBES, PROBE_TIMEOUT_MS, HubRouteUnavailableError } from './route-policy';

const log = new Logger('app.hub-route');
interface ProbePermit {
  readonly scopeId: string;
  readonly kind: HubEndpoint['kind'];
  readonly retire: () => void;
}
const pending = new Map<symbol, ProbePermit>();

export function retireHubProbes(scopeId: string): void {
  for (const permit of pending.values()) {
    if (permit.scopeId === scopeId) permit.retire();
  }
}

export async function probeHubEndpoint(
  scopeId: string,
  endpoint: HubEndpoint,
  metadata: HubConnectionMetadata,
): Promise<boolean> {
  try {
    const response = await probeResponse(scopeId, endpoint);
    if (!response.ok) return false;
    const answer = HUB_PUBLIC_IDENTITY.parse(await response.json());
    return (
      answer.identity.id === metadata.identity.id &&
      answer.identity.tls.certificateSha256 === metadata.identity.tls.certificateSha256 &&
      answer.identity.tls.serverName === metadata.identity.tls.serverName
    );
  } catch (error) {
    log.debug('route.probe_failed', {
      kind: endpoint.kind,
      failure: error instanceof Error ? error.name : 'TransportFailure',
    });
    return false;
  }
}

function probeResponse(scopeId: string, endpoint: HubEndpoint): Promise<Response> {
  const lanCount = [...pending.values()].filter((permit) => permit.kind === 'lan').length;
  if (pending.size >= MAX_PROBES || (endpoint.kind === 'lan' && lanCount >= MAX_PROBES - 1))
    return Promise.reject(
      new HubRouteUnavailableError('The previous hub identity probes are still retiring.'),
    );
  const controller = new AbortController();
  const key = Symbol();
  let fail: (reason: unknown) => void = () => undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    fail = reject;
  });
  const retire = (): void => {
    controller.abort();
    fail(new HubRouteUnavailableError('Hub identity probe expired or its scope was retired.'));
  };
  pending.set(key, { scopeId, kind: endpoint.kind, retire });
  const underlying = sendProbe(scopeId, endpoint, controller.signal).finally(() => {
    pending.delete(key);
  });
  const timer = setTimeout(retire, PROBE_TIMEOUT_MS);
  return Promise.race([underlying, deadline]).finally(() => {
    clearTimeout(timer);
  });
}

async function sendProbe(
  scopeId: string,
  endpoint: HubEndpoint,
  signal: AbortSignal,
): Promise<Response> {
  const url = `${endpoint.url}${HUB_IDENTITY_PATH}`;
  if (endpoint.kind === 'lan') return pinnedFetch(scopeId, url, { method: 'GET' });
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal });
  const body = await response.text();
  return new Response(body === '' ? null : body, {
    status: response.status,
    headers: response.headers,
  });
}
