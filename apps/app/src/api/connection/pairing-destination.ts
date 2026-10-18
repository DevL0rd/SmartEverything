import {
  HUB_CONNECTION_PROTOCOL,
  HUB_ENDPOINT,
  HUB_PAIRING_CANDIDATE_URL,
  type HubConnectionMetadata,
  type HubDiscoveryCandidate,
  type HubEndpoint,
  type HubIdentity,
  type HubPairingObservation,
  type PairingQr,
} from '@smarteverything/domain';
import { appPlatform } from '../../design/platform';
import {
  PairingTargetError,
  PairingUnreachableError,
  PairingUnreadableError,
} from './pairing-errors';
import { hubNetwork } from './route-platform';
import { bootstrapEndpoint } from './route-policy';

export type EnrollmentDestination =
  | { readonly kind: 'https'; readonly endpoint: HubEndpoint }
  | {
      readonly kind: 'pinned' | 'inspected';
      readonly endpoint: HubEndpoint;
      readonly identity: HubIdentity;
    };

function originOf(endpoint: HubEndpoint): HubEndpoint {
  const parsed = HUB_ENDPOINT.parse(endpoint);
  const url = new URL(parsed.url);
  const loopback = parsed.kind === 'loopback' && appPlatform() === 'web';
  if (
    (!loopback && url.protocol !== 'https:') ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new PairingTargetError();
  return { ...parsed, url: url.origin };
}

export function httpsDestination(url: string): EnrollmentDestination {
  const endpoint = bootstrapEndpoint(url);
  if (endpoint.kind !== 'remote' && !(endpoint.kind === 'loopback' && appPlatform() === 'web'))
    throw new PairingTargetError();
  return { kind: 'https', endpoint: originOf(endpoint) };
}

export function destinationsFromQr(qr: PairingQr): readonly EnrollmentDestination[] {
  if (!qr.endpoints.some((endpoint) => endpoint.url === qr.url)) throw new PairingTargetError();
  const remote = qr.endpoints.find((endpoint) => endpoint.kind === 'remote');
  const local = hubNetwork().capabilities.http
    ? qr.endpoints.filter(
        (endpoint) =>
          endpoint.kind === 'lan' && HUB_PAIRING_CANDIDATE_URL.safeParse(endpoint.url).success,
      )
    : [];
  const endpoints = remote === undefined ? local : [...local, remote];
  if (endpoints.length === 0) throw new PairingUnreachableError();
  return endpoints.map((endpoint) => ({
    kind: 'pinned',
    endpoint: originOf(endpoint),
    identity: qr.identity,
  }));
}

export function inspectedDestination(
  candidate: HubDiscoveryCandidate,
  observed: HubPairingObservation,
): EnrollmentDestination {
  return {
    kind: 'inspected',
    endpoint: originOf({ kind: 'lan', url: observed.url }),
    identity: {
      id: observed.tls.publicKeySha256,
      protocolVersion: HUB_CONNECTION_PROTOCOL,
      name: candidate.name,
      tls: observed.tls,
    },
  };
}

export function trustedInventory(
  metadata: HubConnectionMetadata,
  endpoint: HubEndpoint,
): HubConnectionMetadata {
  const endpoints = metadata.endpoints
    .filter(
      (entry) =>
        entry.kind !== 'loopback' || (endpoint.kind === 'loopback' && entry.url === endpoint.url),
    )
    .map(originOf);
  if (!endpoints.some((entry) => entry.url === endpoint.url && entry.kind === endpoint.kind))
    throw new PairingUnreadableError();
  return { ...metadata, endpoints };
}
