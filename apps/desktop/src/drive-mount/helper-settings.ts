import { readFile, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import {
  DEFAULT_DESKTOP_DRIVE_CACHE,
  DESKTOP_DRIVE_CACHE,
  type DesktopDriveCache,
  type HubEndpoint,
  type NativeHubTrust,
} from '@smarteverything/domain';
import type { HelperCacheLine, HelperRouteLine } from './helper-process.js';

export interface HelperRouteSource {
  readonly state: { readonly endpoint: HubEndpoint | null };
  readonly view: { readonly trust: NativeHubTrust | null };
  readonly subscribe: (listener: () => void) => () => void;
}

const NO_ROUTE: HelperRouteLine = { op: 'route' };

function lanAddressOf(endpoint: URL, trust: NativeHubTrust): string | null {
  const host = endpoint.hostname.replace(/^\[|\]$/g, '');
  const address = isIP(host) > 0 ? host : trust.lanAddresses[0];
  return address !== undefined && trust.lanAddresses.includes(address) ? address : null;
}

export function helperRouteOf(
  endpoint: HubEndpoint | null,
  trust: NativeHubTrust | null,
): HelperRouteLine {
  if (endpoint === null) return NO_ROUTE;
  if (endpoint.kind === 'remote') return { op: 'route', url: new URL(endpoint.url).origin };
  if (trust === null) return NO_ROUTE;
  const url = new URL(endpoint.url);
  const address = lanAddressOf(url, trust);
  if (address === null) return NO_ROUTE;
  url.hostname = isIP(address) === 6 ? `[${address}]` : address;
  return {
    op: 'route',
    url: url.origin,
    server: trust.identity.tls.serverName,
    pin: trust.identity.tls.publicKeySha256,
  };
}

export function routeWordOf(line: HelperRouteLine): string {
  if (line.url === undefined) return 'none';
  return line.server === undefined ? 'public' : 'home';
}

export function helperCacheOf(cache: DesktopDriveCache): HelperCacheLine {
  return {
    op: 'cache',
    maxAgeSeconds: cache.maxAgeSeconds,
    cleanupSeconds: cache.cleanupSeconds,
    ...(cache.maxBytes === null ? {} : { maxBytes: cache.maxBytes }),
    ...(cache.minFreeBytes === null ? {} : { minFreeBytes: cache.minFreeBytes }),
  };
}

export class CacheSettingsFile {
  private current: DesktopDriveCache | null = null;

  constructor(private readonly file: string) {}

  async read(): Promise<DesktopDriveCache> {
    this.current ??= await this.load();
    return this.current;
  }

  async write(cache: DesktopDriveCache): Promise<void> {
    const parsed = DESKTOP_DRIVE_CACHE.parse(cache);
    await writeFile(this.file, JSON.stringify(parsed), { mode: 0o600 });
    this.current = parsed;
  }

  private async load(): Promise<DesktopDriveCache> {
    try {
      return DESKTOP_DRIVE_CACHE.parse(JSON.parse(await readFile(this.file, 'utf8')));
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
        return DEFAULT_DESKTOP_DRIVE_CACHE;
      }
      throw cause;
    }
  }
}
