import type { AddressInfo } from 'node:net';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import type { HubEndpoint } from '@smarteverything/domain';

export type InterfaceSnapshot = Readonly<
  Record<string, readonly NetworkInterfaceInfo[] | undefined>
>;
const ENDPOINT_LIMIT = 29;

function usable(entry: NetworkInterfaceInfo, listener: AddressInfo): boolean {
  if (entry.internal || entry.address.includes('%') || ('scopeid' in entry && entry.scopeid > 0)) {
    return false;
  }
  if (entry.address.startsWith('fe80:') || entry.address === '0.0.0.0' || entry.address === '::') {
    return false;
  }
  if (listener.address === '0.0.0.0') return entry.family === 'IPv4';
  if (listener.address === '::') return true;
  return entry.address === listener.address;
}

export function lanEndpoints(
  listener: AddressInfo,
  interfaces: InterfaceSnapshot = networkInterfaces(),
): readonly HubEndpoint[] {
  const entries = Object.values(interfaces).flatMap((addresses) => addresses ?? []);
  return [
    ...new Set(entries.filter((entry) => usable(entry, listener)).map(({ address }) => address)),
  ]
    .slice(0, ENDPOINT_LIMIT)
    .map((address): HubEndpoint => ({
      kind: 'lan',
      url: `https://${address.includes(':') ? `[${address}]` : address}:${String(listener.port)}`,
    }));
}
