import { z } from 'zod';
import type { HubEndpoint, HubConnectionMetadata, NativeHubTrust } from '@smarteverything/domain';
import { appPlatform } from '../../design/platform';
import { hubNetwork } from './route-platform';

const IP = z.union([z.ipv4(), z.ipv6()]);
export const PROBE_TIMEOUT_MS = 4000;
export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_PROBES = 4;

export class HubRouteUnavailableError extends Error {
  override readonly name = 'HubRouteUnavailableError';
}

export class StaleHubRouteError extends Error {
  override readonly name = 'StaleHubRouteError';
  constructor(readonly method: string) {
    super(
      method === 'GET'
        ? 'The hub route changed before this answer arrived.'
        : 'The hub route changed; this operation may have completed and will not be replayed.',
    );
  }
}

export function trustedBootstrap(url: string): boolean {
  const parsed = new URL(url);
  return (
    bootstrapEndpoint(url).kind !== 'lan' &&
    (parsed.protocol === 'https:' ||
      (appPlatform() === 'desktop' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))
  );
}

export function bootstrapEndpoint(url: string, kind?: HubEndpoint['kind']): HubEndpoint {
  if (kind !== undefined) return { kind, url };
  const parsed = new URL(url);
  return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    ? { kind: 'loopback', url }
    : IP.safeParse(parsed.hostname.replace(/^\[|\]$/g, '')).success ||
        parsed.hostname.endsWith('.local')
      ? { kind: 'lan', url }
      : { kind: 'remote', url };
}

export function usableEndpoints(
  metadata: HubConnectionMetadata,
  canonical: HubEndpoint,
): HubEndpoint[] {
  const supported = hubNetwork().capabilities;
  const endpoints = metadata.endpoints.filter((endpoint) =>
    endpoint.kind === 'lan'
      ? supported.http && supported.websocket
      : endpoint.kind !== 'loopback' || appPlatform() === 'desktop',
  );
  const distinct = new Map(endpoints.map((endpoint) => [endpoint.url, endpoint]));
  if (
    !distinct.has(canonical.url) &&
    (canonical.kind !== 'lan' || (supported.http && supported.websocket))
  )
    distinct.set(canonical.url, canonical);
  return [...distinct.values()].sort((left, right) => rank(left) - rank(right));
}

function rank(endpoint: HubEndpoint): number {
  return endpoint.kind === 'loopback' ? 0 : endpoint.kind === 'lan' ? 1 : 2;
}

export function trustOf(scopeId: string, metadata: HubConnectionMetadata): NativeHubTrust {
  const lanAddresses = metadata.endpoints.flatMap((endpoint) => {
    if (endpoint.kind !== 'lan') return [];
    const parsed = IP.safeParse(new URL(endpoint.url).hostname.replace(/^\[|\]$/g, ''));
    return parsed.success ? [parsed.data] : [];
  });
  return { scopeId, identity: metadata.identity, endpoints: metadata.endpoints, lanAddresses };
}

export function usableEndpointsForMedia(
  metadata: HubConnectionMetadata | null,
  canonical: HubEndpoint,
): HubEndpoint | null {
  return canonical.kind !== 'lan'
    ? canonical
    : (metadata?.endpoints.find((endpoint) => endpoint.kind === 'remote') ?? null);
}

export function requireTrustedBootstrap(endpoint: HubEndpoint): void {
  if (endpoint.kind === 'lan')
    throw new HubRouteUnavailableError(
      'A local hub requires saved independently verified identity before authentication.',
    );
}
