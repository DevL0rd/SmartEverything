import {
  DEFAULT_DESKTOP_DRIVE_CACHE,
  DEFAULT_DESKTOP_DRIVE_TUNING,
  type NativeHubTrust,
} from '@smarteverything/domain';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DriveSettingsFile,
  helperCacheOf,
  helperRouteOf,
  helperTuningOf,
} from '../../src/drive-mount/helper-settings.js';

const KEY = 'a'.repeat(64);

const TRUST: NativeHubTrust = {
  scopeId: 'scope-1',
  identity: {
    id: 'b'.repeat(64),
    protocolVersion: 1,
    name: 'Home',
    tls: {
      serverName: `smarteverything-${'c'.repeat(32)}.local`,
      certificateSha256: 'd'.repeat(64),
      publicKeySha256: KEY,
    },
  },
  endpoints: [
    { kind: 'lan', url: 'https://192.168.50.254:8443' },
    { kind: 'remote', url: 'https://home.example.com' },
  ],
  lanAddresses: ['192.168.50.254'],
};

describe('mount helper route', () => {
  it('sends the LAN address with the paired name and key when at home', () => {
    expect(helperRouteOf({ kind: 'lan', url: 'https://192.168.50.254:8443/' }, TRUST)).toEqual({
      op: 'route',
      url: 'https://192.168.50.254:8443',
      server: TRUST.identity.tls.serverName,
      pin: KEY,
    });
  });

  it('dials the first home address when the LAN endpoint names the hub by host name', () => {
    const line = helperRouteOf({ kind: 'lan', url: 'https://hub.local:8443' }, TRUST);
    expect(line.url).toBe('https://192.168.50.254:8443');
  });

  it('uses the public address with system trust away from home', () => {
    expect(helperRouteOf({ kind: 'remote', url: 'https://home.example.com/app' }, TRUST)).toEqual({
      op: 'route',
      url: 'https://home.example.com',
    });
  });

  it('sends no route while nothing is reachable or the LAN address is not paired', () => {
    expect(helperRouteOf(null, TRUST)).toEqual({ op: 'route' });
    expect(helperRouteOf({ kind: 'lan', url: 'https://10.0.0.9:8443' }, TRUST)).toEqual({
      op: 'route',
    });
    expect(helperRouteOf({ kind: 'lan', url: 'https://192.168.50.254:8443' }, null)).toEqual({
      op: 'route',
    });
  });
});

describe('mount helper cache settings', () => {
  it('leaves the size cap and free space floor out when they are off', () => {
    expect(
      helperCacheOf({
        maxAgeSeconds: 3600,
        maxBytes: null,
        minFreeBytes: null,
        cleanupSeconds: 60,
      }),
    ).toEqual({ op: 'cache', maxAgeSeconds: 3600, cleanupSeconds: 60 });
    expect(
      helperCacheOf({ maxAgeSeconds: 60, maxBytes: 10, minFreeBytes: 20, cleanupSeconds: 5 }),
    ).toEqual({
      op: 'cache',
      maxAgeSeconds: 60,
      maxBytes: 10,
      minFreeBytes: 20,
      cleanupSeconds: 5,
    });
  });
});

describe('mount helper tuning line', () => {
  it('names "until changed" the way the helper reads it and keeps every other value', () => {
    const line = helperTuningOf({ ...DEFAULT_DESKTOP_DRIVE_TUNING, attrSeconds: 60 });
    expect(line).toEqual({
      op: 'tuning',
      tuning: {
        ...DEFAULT_DESKTOP_DRIVE_TUNING,
        entrySeconds: 'untilChanged',
        attrSeconds: 60,
        negativeSeconds: 'untilChanged',
      },
    });
  });
});

describe('drive settings file', () => {
  let folder = '';

  beforeEach(async () => {
    const scratch = join(process.cwd(), 'tmp', 'mount-tuning-tests');
    await mkdir(scratch, { recursive: true });
    folder = await mkdtemp(join(scratch, 'settings-'));
  });

  afterEach(async () => {
    await rm(join(process.cwd(), 'tmp', 'mount-tuning-tests'), { recursive: true, force: true });
  });

  it('starts with the defaults and keeps cache and tuning together across restarts', async () => {
    const file = join(folder, 'drive-settings.json');
    const legacy = join(folder, 'drive-cache.json');
    const first = new DriveSettingsFile(file, legacy);
    expect(await first.read()).toEqual({
      cache: DEFAULT_DESKTOP_DRIVE_CACHE,
      tuning: DEFAULT_DESKTOP_DRIVE_TUNING,
    });
    const tuning = { ...DEFAULT_DESKTOP_DRIVE_TUNING, maxBackground: 128 };
    await first.writeTuning(tuning);
    const cache = { ...DEFAULT_DESKTOP_DRIVE_CACHE, maxAgeSeconds: 99 };
    await first.writeCache(cache);
    expect(await new DriveSettingsFile(file, legacy).read()).toEqual({ cache, tuning });
  });

  it('migrates the old cache-only file once and removes it', async () => {
    const file = join(folder, 'drive-settings.json');
    const legacy = join(folder, 'drive-cache.json');
    const cache = { maxAgeSeconds: 7200, maxBytes: null, minFreeBytes: 5, cleanupSeconds: 60 };
    await writeFile(legacy, JSON.stringify(cache));
    const settings = await new DriveSettingsFile(file, legacy).read();
    expect(settings).toEqual({ cache, tuning: DEFAULT_DESKTOP_DRIVE_TUNING });
    await expect(stat(legacy)).rejects.toThrow('ENOENT');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      cache,
      tuning: DEFAULT_DESKTOP_DRIVE_TUNING,
    });
  });

  it('fails loudly on a damaged settings file instead of using defaults', async () => {
    const file = join(folder, 'drive-settings.json');
    await writeFile(file, '{"cache":1}');
    await expect(new DriveSettingsFile(file, join(folder, 'old.json')).read()).rejects.toThrow();
  });
});
