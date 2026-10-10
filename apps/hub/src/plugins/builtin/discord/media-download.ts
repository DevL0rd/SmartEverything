import { lookup } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';
import { request, type RequestOptions } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { DiscordInputError } from './errors';

export type Downloader = (url: URL, expected: number) => Promise<Buffer>;

interface Address {
  readonly address: string;
  readonly family: number;
}

export type Resolver = (host: string) => Promise<readonly Address[]>;

const CDN_HOST = 'cdn.discordapp.com';
const TIMEOUT_MS = 10_000;
const MAX_ADDRESSES = 16;

const NOT_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, 'ipv4');
}
const GLOBAL_V6 = new BlockList();
GLOBAL_V6.addSubnet('2000::', 3, 'ipv6');

function publicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return !NOT_PUBLIC.check(address, 'ipv4');
  }
  return family === 6 && GLOBAL_V6.check(address, 'ipv6');
}

function assertCdn(url: URL): void {
  const plain = url.port === '' && url.username === '' && url.password === '' && url.hash === '';
  if (url.protocol !== 'https:' || url.hostname !== CDN_HOST || !plain) {
    throw new DiscordInputError('Attachment CDN is not approved');
  }
}

export function attachmentUrl(value: string, channelId: string, attachmentId: string): URL {
  const url = new URL(value);
  assertCdn(url);
  const prefix = `/attachments/${channelId}/${attachmentId}/`;
  if (!url.pathname.startsWith(prefix) || url.pathname.slice(prefix.length).includes('/')) {
    throw new DiscordInputError('Attachment path does not match its source');
  }
  const filename = decodeURIComponent(url.pathname.slice(prefix.length));
  if (filename === '' || /[/\\]/.test(filename) || filename === '..') {
    throw new DiscordInputError('Invalid CDN filename');
  }
  return url;
}

function pinned(url: URL, address: Address, signal: AbortSignal): RequestOptions {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  return {
    method: 'GET',
    agent: false,
    signal,
    headers: { 'Accept-Encoding': 'identity' },
    servername: isIP(host) === 0 ? host : undefined,
    lookup: (_host, options, callback): void => {
      if (options.all === true) {
        callback(null, [address]);
      } else {
        callback(null, address.address, address.family);
      }
    },
  };
}

async function resolved(url: URL, resolver: Resolver): Promise<Address> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses =
    isIP(host) === 0 ? await resolver(host) : [{ address: host, family: isIP(host) }];
  const [first] = addresses;
  if (
    first === undefined ||
    addresses.length > MAX_ADDRESSES ||
    addresses.some((item) => !publicAddress(item.address))
  ) {
    throw new DiscordInputError('The attachment host did not resolve to a public address');
  }
  return first;
}

function collect(
  incoming: IncomingMessage,
  expected: number,
  resolve: (data: Buffer) => void,
  reject: (error: Error) => void,
): void {
  if (incoming.statusCode !== 200 || incoming.headers['content-encoding'] !== undefined) {
    incoming.destroy();
    reject(new DiscordInputError('Attachment response rejected; redirects are forbidden'));
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  incoming.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > expected) {
      incoming.destroy();
      reject(new DiscordInputError('Attachment exceeds declared size'));
      return;
    }
    chunks.push(chunk);
  });
  incoming.on('error', (cause) => {
    reject(new DiscordInputError(`Attachment stream failed: ${cause.message}`));
  });
  incoming.on('end', () => {
    if (size === expected) {
      resolve(Buffer.concat(chunks));
    } else {
      reject(new DiscordInputError('Attachment size changed'));
    }
  });
}

export function downloader(
  resolver: Resolver = (host) => lookup(host, { all: true, verbatim: true }),
): Downloader {
  return async (url, expected) => {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const address = await resolved(url, resolver);
    return new Promise<Buffer>((resolve, reject) => {
      const outgoing = request(url, pinned(url, address, signal), (incoming) => {
        collect(incoming, expected, resolve, reject);
      });
      outgoing.on('error', (cause) => {
        reject(new DiscordInputError(`Attachment download failed: ${cause.message}`));
      });
      outgoing.end();
    });
  };
}
