import { readFile, rm, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import {
  DEFAULT_DESKTOP_DRIVE_CACHE,
  DEFAULT_DESKTOP_DRIVE_TUNING,
  DESKTOP_DRIVE_CACHE,
  DESKTOP_DRIVE_TUNING,
  DESKTOP_DRIVE_UNTIL_CHANGED,
  type DesktopDriveCache,
  type DesktopDriveTuning,
  type HubEndpoint,
  type NativeHubTrust,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { HelperCacheLine, HelperRouteLine, HelperTuningLine } from './helper-process.js';

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

const HELPER_UNTIL_CHANGED = 'untilChanged';

function lifetimeOf(value: DesktopDriveTuning['entrySeconds']): string | number {
  return value === DESKTOP_DRIVE_UNTIL_CHANGED ? HELPER_UNTIL_CHANGED : value;
}

export function helperTuningOf(tuning: DesktopDriveTuning): HelperTuningLine {
  return {
    op: 'tuning',
    tuning: {
      ...tuning,
      entrySeconds: lifetimeOf(tuning.entrySeconds),
      attrSeconds: lifetimeOf(tuning.attrSeconds),
      negativeSeconds: lifetimeOf(tuning.negativeSeconds),
    },
  };
}

const DRIVE_SETTINGS = z
  .strictObject({ cache: DESKTOP_DRIVE_CACHE, tuning: DESKTOP_DRIVE_TUNING })
  .readonly();

export type DriveSettings = z.infer<typeof DRIVE_SETTINGS>;

async function readOptional(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return null;
    throw cause;
  }
}

export class DriveSettingsFile {
  private loaded: Promise<DriveSettings> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly legacyCacheFile: string,
  ) {}

  read(): Promise<DriveSettings> {
    this.loaded ??= this.load();
    return this.loaded;
  }

  writeCache(cache: DesktopDriveCache): Promise<DriveSettings> {
    return this.update({ cache: DESKTOP_DRIVE_CACHE.parse(cache) });
  }

  writeTuning(tuning: DesktopDriveTuning): Promise<DriveSettings> {
    return this.update({ tuning: DESKTOP_DRIVE_TUNING.parse(tuning) });
  }

  private update(change: Partial<DriveSettings>): Promise<DriveSettings> {
    const next = this.queue.then(async () => {
      const merged = DRIVE_SETTINGS.parse({ ...(await this.read()), ...change });
      await this.save(merged);
      this.loaded = Promise.resolve(merged);
      return merged;
    });
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private save(settings: DriveSettings): Promise<void> {
    return writeFile(this.file, JSON.stringify(settings), { mode: 0o600 });
  }

  private async load(): Promise<DriveSettings> {
    const stored = await readOptional(this.file);
    if (stored !== null) return DRIVE_SETTINGS.parse(JSON.parse(stored));
    const legacy = await readOptional(this.legacyCacheFile);
    if (legacy === null) {
      return { cache: DEFAULT_DESKTOP_DRIVE_CACHE, tuning: DEFAULT_DESKTOP_DRIVE_TUNING };
    }
    const migrated: DriveSettings = {
      cache: DESKTOP_DRIVE_CACHE.parse(JSON.parse(legacy)),
      tuning: DEFAULT_DESKTOP_DRIVE_TUNING,
    };
    await this.save(migrated);
    await rm(this.legacyCacheFile);
    return migrated;
  }
}
