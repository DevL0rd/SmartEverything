import { lookup as resolve, promises as dns, type LookupAddress } from 'node:dns';
import { networkInterfaces } from 'node:os';
import { isIP, type LookupFunction } from 'node:net';
import { isLocalAddress } from '../../automations/effects/http-guard';

export class FeedAddressError extends Error {
  override readonly name = 'FeedAddressError';
}

export function feedUrlOf(text: string): URL {
  const address = text.trim().replace(/^webcals?:/i, 'https:');
  if (!URL.canParse(address)) {
    throw new FeedAddressError('The calendar address is not a web address.');
  }
  const url = new URL(address);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FeedAddressError('A calendar address starts with http, https or webcal.');
  }
  return url;
}

export function ownAddresses(): ReadonlySet<string> {
  return new Set(
    Object.values(networkInterfaces()).flatMap((entries) =>
      (entries ?? []).map((entry) => entry.address),
    ),
  );
}

function bare(hostname: string): string {
  return hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
}

function refused(host: string): FeedAddressError {
  return new FeedAddressError(
    `${host} is on this network or on this hub; only the owner can subscribe to such an address.`,
  );
}

function assertOutside(address: string, host: string, own: ReadonlySet<string>): void {
  if (isLocalAddress(address) || own.has(address)) throw refused(host);
}

export function assertLiteralHost(url: URL, allowPrivate: boolean): void {
  if (allowPrivate) return;
  const host = bare(url.hostname);
  if (isIP(host) !== 0) assertOutside(host, url.hostname, ownAddresses());
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

export const outsideOnlyLookup: LookupFunction = (hostname, options, callback) => {
  resolve(hostname, { ...options, all: true }, (error, addresses) => {
    if (error !== null) {
      callback(error, []);
      return;
    }
    const own = ownAddresses();
    try {
      for (const entry of addresses) assertOutside(entry.address, hostname, own);
    } catch (cause) {
      callback(
        Object.assign(cause instanceof Error ? cause : new Error(String(cause)), {
          code: 'ELOCALNET',
        }),
        [],
      );
      return;
    }
    answered(addresses, options.all === true, callback);
  });
};

export async function assertReachable(url: URL, allowPrivate: boolean): Promise<void> {
  if (allowPrivate) return;
  const own = ownAddresses();
  const host = bare(url.hostname);
  const addresses = isIP(host) === 0 ? await dns.lookup(host, { all: true }) : [{ address: host }];
  for (const entry of addresses) assertOutside(entry.address, url.hostname, own);
}
