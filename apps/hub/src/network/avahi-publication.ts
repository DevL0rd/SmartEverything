import { lanEndpoints } from './addresses';
import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { HUB_DISCOVERY_SERVICE, type HubIdentity } from '@smarteverything/domain';
import { z } from 'zod';
import {
  AVAHI_SERVER as SERVER,
  DiscoveryError,
  avahiCall as boundedCall,
  type DiscoveryBus,
} from './avahi-bus';

const NO_REVERSE_RECORD = 16;
const STATE_REPLY = z.tuple([z.int()]);
export interface PublicationOptions {
  readonly identity: HubIdentity;
  readonly listener: AddressInfo;
  readonly bus: DiscoveryBus;
  readonly signal: AbortSignal;
  readonly groupCall: (
    member: string,
    signature?: string,
    body?: readonly unknown[],
  ) => Promise<readonly unknown[]>;
}

function interfaceName(listener: AddressInfo): string | null {
  if (listener.address === '0.0.0.0' || listener.address === '::') return null;
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    if (addresses?.some((entry) => !entry.internal && entry.address === listener.address) === true)
      return name;
  }
  throw new DiscoveryError('interface selection', 'the listener has no usable LAN interface');
}

export async function addAvahiAddresses(options: PublicationOptions): Promise<void> {
  const endpoints = lanEndpoints(options.listener);
  if (endpoints.length === 0)
    throw new DiscoveryError('address publication', 'no usable LAN address');
  for (const endpoint of endpoints) {
    const address = new URL(endpoint.url).hostname.replace(/^\[|\]$/g, '');
    const listener = { ...options.listener, address };
    const name = interfaceName(listener);
    const index =
      name === null
        ? -1
        : STATE_REPLY.parse(
            await boundedCall(
              options.bus,
              {
                ...SERVER,
                member: 'GetNetworkInterfaceIndexByName',
                signature: 's',
                body: [name],
              },
              options.signal,
            ),
          )[0];
    await options.groupCall('AddAddress', 'iiuss', [
      index,
      address.includes(':') ? 1 : 0,
      NO_REVERSE_RECORD,
      options.identity.tls.serverName,
      address,
    ]);
  }
}

export async function addAvahiService(options: PublicationOptions): Promise<void> {
  const name = interfaceName(options.listener);
  const index =
    name === null
      ? -1
      : STATE_REPLY.parse(
          await boundedCall(
            options.bus,
            {
              ...SERVER,
              member: 'GetNetworkInterfaceIndexByName',
              signature: 's',
              body: [name],
            },
            options.signal,
          ),
        )[0];
  const { identity, listener } = options;
  const protocol = listener.address === '::' ? -1 : listener.family === 'IPv6' ? 1 : 0;
  await options.groupCall('AddService', 'iiussssqaay', [
    index,
    protocol,
    0,
    `${identity.name.slice(0, 48)} ${identity.id.slice(0, 8)}`,
    HUB_DISCOVERY_SERVICE,
    '',
    identity.tls.serverName,
    listener.port,
    [`id=${identity.id}`, 'protocol=1', 'tls=1', `host=${identity.tls.serverName}`].map((entry) => [
      ...Buffer.from(entry),
    ]),
  ]);
}
