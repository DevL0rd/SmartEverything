import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import appConfig from '../../apps/app/app.config.ts';
import {
  ReleaseVersionError,
  VERSIONED_PACKAGES,
  agreedVersion,
  readVersions,
  withVersion,
} from '../release-version.ts';

const IDENTITY = z
  .object({ storeIdentity: z.string().min(1) })
  .parse(
    JSON.parse(
      readFileSync(
        join(import.meta.dirname, '..', '..', 'apps', 'app', 'app-identity.json'),
        'utf8',
      ),
    ),
  ).storeIdentity;

const SERVER = 'https://hub.example.test';

afterEach(() => {
  vi.unstubAllEnvs();
});

function build(environment: Readonly<Record<string, string>>): ReturnType<typeof appConfig> {
  vi.stubEnv('EXPO_PUBLIC_SERVER_URL', SERVER);
  vi.stubEnv('APP_VARIANT', undefined);
  vi.stubEnv('ANDROID_VERSION_CODE', undefined);
  for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
  return appConfig();
}

describe('the release number', () => {
  it('is the same in the app, the desktop and the hub', () => {
    expect(() => agreedVersion(readVersions())).not.toThrow();
    expect(Object.keys(readVersions())).toEqual([...VERSIONED_PACKAGES]);
  });

  it('refuses two packages on different versions', () => {
    expect(() => agreedVersion({ app: '0.2.0', desktop: '0.1.0', hub: '0.2.0' })).toThrow(
      ReleaseVersionError,
    );
  });

  it('rewrites only the version of a manifest and keeps everything else in order', () => {
    const rewritten = withVersion('{"name":"x","version":"0.1.0","scripts":{"a":"b"}}', '1.2.3');
    expect(rewritten).toBe(
      '{\n  "name": "x",\n  "version": "1.2.3",\n  "scripts": {\n    "a": "b"\n  }\n}\n',
    );
  });

  it('refuses a version that is not three plain numbers', () => {
    expect(() => withVersion('{"version":"0.1.0"}', '1.2')).toThrow();
    expect(() => withVersion('{"version":"0.1.0"}', 'v1.2.3')).toThrow();
  });
});

describe('the build variants', () => {
  it('gives the release build the store identity, its own scheme and the shared version', () => {
    const config = build({});
    expect(config.android?.package).toBe(IDENTITY);
    expect(config.scheme).toBe('smarteverything');
    expect(config.name).toBe('SmartEverything');
    expect(config.version).toBe(agreedVersion(readVersions()));
  });

  it('gives the development build a separate package, scheme and name so both install together', () => {
    const release = build({});
    const development = build({ APP_VARIANT: 'development' });
    expect(development.android?.package).toBe(`${IDENTITY}.dev`);
    expect(development.scheme).toBe('smarteverything-dev');
    expect(development.name).toBe('SmartEverything Dev');
    expect(development.android?.package).not.toBe(release.android?.package);
  });

  it('numbers builds by the minute so a later build always installs over an earlier one', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-18T01:00:00Z'));
      const first = build({}).android?.versionCode;
      vi.setSystemTime(new Date('2026-10-18T01:01:00Z'));
      const second = build({}).android?.versionCode;
      expect(second).toBe((first ?? 0) + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('takes an explicit version code and refuses one that is too low or too high', () => {
    expect(build({ ANDROID_VERSION_CODE: '31000000' }).android?.versionCode).toBe(31000000);
    expect(() => build({ ANDROID_VERSION_CODE: '2' })).toThrow('ANDROID_VERSION_CODE');
    expect(() => build({ ANDROID_VERSION_CODE: '2100000001' })).toThrow('ANDROID_VERSION_CODE');
  });

  it('keeps the version code of a release build above the one a development build had', () => {
    expect(build({}).android?.versionCode).toBeGreaterThan(29_000_000);
  });

  it('takes the Health Connect privacy policy from the server address and drops it without one', () => {
    const withServer = build({});
    expect(withServer.extra).toEqual({ privacyPolicyUrl: `${SERVER}/privacy` });
    expect(withServer.plugins).toContainEqual([
      './modules/health-connect/app.plugin.js',
      { privacyPolicyUrl: `${SERVER}/privacy` },
    ]);
    vi.stubEnv('EXPO_PUBLIC_SERVER_URL', undefined);
    const without = appConfig();
    expect(without.extra).toEqual({ privacyPolicyUrl: null });
    expect(without.plugins ?? []).not.toContainEqual(
      expect.arrayContaining(['./modules/health-connect/app.plugin.js']),
    );
  });

  it('refuses a server address that is not https', () => {
    expect(() => build({ EXPO_PUBLIC_SERVER_URL: 'http://hub.example.test' })).toThrow(
      'EXPO_PUBLIC_SERVER_URL',
    );
  });

  it('signs the release build with the release key plugin', () => {
    expect(build({}).plugins).toContain('./plugins/release-signing/app.plugin.js');
  });
});

describe('scratch manifests', () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  it('are written whole by the version rewrite', () => {
    const directory = mkdtempSync(join(tmpdir(), 'release-version-'));
    directories.push(directory);
    const file = join(directory, 'package.json');
    writeFileSync(file, '{"name":"x","version":"0.1.0"}');
    expect(JSON.parse(withVersion(readFileSync(file, 'utf8'), '0.2.0'))).toEqual({
      name: 'x',
      version: '0.2.0',
    });
  });
});
