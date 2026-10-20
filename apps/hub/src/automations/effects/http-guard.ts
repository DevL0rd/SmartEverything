import { lookup as resolve, type LookupAddress } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';

const LOCAL = new BlockList();

const LOCAL_V4: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const LOCAL_V6: readonly (readonly [string, number])[] = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

for (const [network, prefix] of LOCAL_V4) LOCAL.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of LOCAL_V6) LOCAL.addSubnet(network, prefix, 'ipv6');

export class LocalNetworkError extends Error {
  override readonly name = 'LocalNetworkError';

  constructor(host: string) {
    super(`${host} is on this network, and the request does not allow local addresses.`);
  }
}

export function isLocalAddress(address: string): boolean {
  const family = isIP(address);
  return family !== 0 && LOCAL.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

export function assertPublicHost(hostname: string): void {
  const host = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
  if (isIP(host) !== 0 && isLocalAddress(host)) throw new LocalNetworkError(hostname);
}

function answered(
  addresses: readonly LookupAddress[],
  all: boolean,
  callback: Parameters<LookupFunction>[2],
): void {
  const [first] = addresses;
  if (all || first === undefined) callback(null, [...addresses]);
  else callback(null, first.address, first.family);
}

export const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  resolve(hostname, { ...options, all: true }, (error, addresses) => {
    if (error !== null) {
      callback(error, []);
      return;
    }
    if (addresses.some((entry) => isLocalAddress(entry.address))) {
      callback(Object.assign(new LocalNetworkError(hostname), { code: 'ELOCALNET' }), []);
      return;
    }
    answered(addresses, options.all === true, callback);
  });
};
