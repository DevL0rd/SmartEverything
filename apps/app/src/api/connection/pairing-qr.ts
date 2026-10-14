import { z } from 'zod';
import { appPlatform } from '../../design/platform';
import { HUB_ENDPOINT, HUB_PAIRING_CANDIDATE_URL, PAIRING_QR } from '@smarteverything/domain';
import type { PairingTarget } from '../pairing-input';
import { bootstrapEndpoint, MAX_PROBES } from './route-policy';
import { hubNetwork } from './route-platform';
import { PairingIdentityError } from './pairing-transport';
import type { EnrollmentDestination } from './pairing-enrollment';

export function destinationsFromQr(input: PairingTarget): readonly EnrollmentDestination[] {
  const qr = PAIRING_QR.safeExtend({ url: z.url({ protocol: /^https?$/ }) }).parse(input);
  if (qr.identity === undefined || qr.endpoints === undefined) {
    const endpoint = HUB_ENDPOINT.parse(bootstrapEndpoint(qr.url));
    if (endpoint.kind !== 'remote' && !(endpoint.kind === 'loopback' && appPlatform() === 'web'))
      throw new PairingIdentityError();
    return [{ kind: 'https', endpoint }];
  }
  if (!qr.endpoints.some((endpoint) => endpoint.url === qr.url)) throw new PairingIdentityError();
  const remote = qr.endpoints.find((endpoint) => endpoint.kind === 'remote');
  const local = hubNetwork().capabilities.http
    ? qr.endpoints
        .filter(
          (endpoint) =>
            endpoint.kind === 'lan' && HUB_PAIRING_CANDIDATE_URL.safeParse(endpoint.url).success,
        )
        .slice(0, MAX_PROBES - 1)
    : [];
  const endpoints = remote === undefined ? local : [...local, remote];
  if (endpoints.length === 0) throw new PairingIdentityError();
  const identity = qr.identity;
  return endpoints.map((endpoint) => ({ kind: 'pinned', endpoint, identity }));
}
