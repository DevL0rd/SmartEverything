import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateHubServiceConfig } from '../src/service/config-migration';
import { ServiceConfigError } from '../src/service/configuration';
import { temporaryDirectory } from './support/server';

let directory: { path: string; remove: () => Promise<void> };
let file: string;

beforeEach(async () => {
  directory = await temporaryDirectory();
  file = join(directory.path, 'service.json');
});

afterEach(async () => {
  await directory.remove();
});

describe('migrateHubServiceConfig', () => {
  it('does nothing when the file is missing', async () => {
    expect(await migrateHubServiceConfig(file)).toBe(false);
    expect(await readdir(directory.path)).toStrictEqual([]);
  });

  it('leaves a file without a role untouched', async () => {
    const saved = '{"go2rtcBinary":"/opt/go2rtc"}';
    await writeFile(file, saved);
    expect(await migrateHubServiceConfig(file)).toBe(false);
    expect(await readFile(file, 'utf8')).toBe(saved);
  });

  it('removes a hub role once and keeps every other key', async () => {
    await writeFile(file, JSON.stringify({ role: 'hub', port: 7881, go2rtcBinary: '/opt/go2rtc' }));
    expect(await migrateHubServiceConfig(file)).toBe(true);
    expect(JSON.parse(await readFile(file, 'utf8'))).toStrictEqual({
      port: 7881,
      go2rtcBinary: '/opt/go2rtc',
    });
    expect(await readdir(directory.path)).toStrictEqual(['service.json']);
    expect(await migrateHubServiceConfig(file)).toBe(false);
  });

  it('refuses another role and leaves the file untouched', async () => {
    const saved = JSON.stringify({ role: 'node', go2rtcBinary: '/opt/go2rtc' });
    await writeFile(file, saved);
    await expect(migrateHubServiceConfig(file)).rejects.toBeInstanceOf(ServiceConfigError);
    expect(await readFile(file, 'utf8')).toBe(saved);
  });

  it('refuses a file that is not JSON', async () => {
    await writeFile(file, 'nope');
    await expect(migrateHubServiceConfig(file)).rejects.toThrow(/it is not JSON/);
  });
});
