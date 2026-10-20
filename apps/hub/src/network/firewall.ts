import type { AddressInfo } from 'node:net';
import { networkOf, type ConnectionPortNeed } from '../firewall/openings';
import { lanEndpoints } from './addresses';
import { interfaceEntries } from './lan';

const MDNS_PORT = 5353;

export function connectionPortNeeds(
  listener: AddressInfo,
  discovery: boolean,
): readonly ConnectionPortNeed[] {
  const addresses = new Set(
    lanEndpoints(listener).map((endpoint) =>
      new URL(endpoint.url).hostname.replace(/^\[|\]$/g, ''),
    ),
  );
  const networks = [
    ...new Set(
      interfaceEntries().flatMap((entry) =>
        addresses.has(entry.address) && entry.cidr !== null ? [networkOf(entry.cidr)] : [],
      ),
    ),
  ];
  return [
    { purpose: 'hub', protocol: 'tcp', port: listener.port, networks },
    ...(discovery
      ? [{ purpose: 'discovery', protocol: 'udp', port: MDNS_PORT, networks } as const]
      : []),
  ];
}
