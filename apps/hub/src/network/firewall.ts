import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import type { ConnectionPortNeed } from '../firewall/openings';
import { lanEndpoints } from './addresses';

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
      Object.values(networkInterfaces()).flatMap((entries) =>
        (entries ?? []).flatMap((entry) =>
          addresses.has(entry.address) && entry.cidr !== null ? [entry.cidr] : [],
        ),
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
