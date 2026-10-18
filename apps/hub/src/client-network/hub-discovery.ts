import { HUB_DISCOVERY_CANDIDATE, type HubDiscoveryCandidate } from '@smarteverything/domain';
import {
  HUB_SERVICE_TYPE,
  watchServices,
  type FoundService,
  type Mdns,
  type ServiceWatch,
} from '../network/mdns';

export function hubCandidate(service: FoundService): HubDiscoveryCandidate | null {
  const id = service.txt.get('id');
  if (id === undefined || service.txt.get('protocol') !== '1' || service.txt.get('tls') !== '1')
    return null;
  const parsed = HUB_DISCOVERY_CANDIDATE.safeParse({
    name: service.name,
    url: `https://${service.address.includes(':') ? `[${service.address}]` : service.address}:${String(service.port)}`,
    hubId: id,
    protocolVersion: 1,
  });
  return parsed.success ? parsed.data : null;
}

export function findHubs(
  mdns: Mdns,
  handlers: {
    readonly found: (key: string, candidate: HubDiscoveryCandidate) => void;
    readonly lost?: (key: string) => void;
  },
): ServiceWatch {
  return watchServices(mdns, HUB_SERVICE_TYPE, {
    found: (service) => {
      const candidate = hubCandidate(service);
      if (candidate !== null) handlers.found(service.fqdn, candidate);
    },
    lost: (fqdn) => handlers.lost?.(fqdn),
  });
}
