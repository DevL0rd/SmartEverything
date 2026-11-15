import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasPicture, thumbVersion } from '../../../src/computers/file-thumbs';
import { collectorFor, UnsupportedPlatformError } from '../../../src/node/collectors/collector';
import { controlsFor } from '../../../src/node/controls/controls';
import { userPlaces } from '../../../src/node/controls/portable/user-places';
import {
  unsupportedAudio,
  unsupportedDisplays,
  unsupportedSession,
  unsupportedSystem,
  unsupportedWindows,
} from '../../../src/node/controls/portable/unsupported';
import { captureLogs, testLogger } from '../../support/logs';

describe('what a Windows or Mac computer does not control yet', () => {
  it('says so plainly instead of pretending', async () => {
    await expect(unsupportedAudio('Windows').read()).rejects.toThrow(
      'Sound control is not available on Windows yet.',
    );
    await expect(
      unsupportedDisplays('macOS').change({ action: 'primary', output: 'HDMI-1' }, false),
    ).rejects.toMatchObject({ code: 'not_supported' });
    await expect(unsupportedWindows('macOS').read()).rejects.toMatchObject({
      code: 'not_supported',
    });
    await expect(unsupportedSession('Windows').setVolume(5)).rejects.toMatchObject({
      code: 'not_supported',
    });
  });

  it('reports no features for any of them', async () => {
    expect(await unsupportedAudio('Windows').features()).toStrictEqual([]);
    expect(await unsupportedDisplays('Windows').features()).toStrictEqual([]);
    expect(await unsupportedWindows('Windows').features()).toStrictEqual([]);
  });

  it('has no watched session on these systems', async () => {
    await expect(unsupportedSession('macOS').start(() => undefined)).rejects.toMatchObject({
      code: 'no_session',
    });
  });

  it('answers the system topics with empty states and only offers the places of the files', async () => {
    const places = { home: '/h', abilities: [], places: [] };
    const system = unsupportedSystem('macOS', () => Promise.resolve(places));
    expect((await system.settings.state()).usb).toStrictEqual([]);
    expect(await system.startup.list()).toStrictEqual({ entries: [] });
    expect(await system.services.list()).toStrictEqual({ services: [], timers: [] });
    expect(await system.files.places()).toBe(places);
    await expect(
      system.files.search({ path: '/', text: 'a', contents: false, cursor: null }),
    ).rejects.toMatchObject({
      code: 'not_supported',
    });
    expect(await system.features()).toStrictEqual([]);
  });
});

describe('file links on a Windows or Mac computer', () => {
  let folder = '';

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'hub-links-'));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it('answers the details of a file from the file system without writing', async () => {
    const path = join(folder, 'photo.png');
    await writeFile(path, 'png');
    const system = unsupportedSystem('Windows', () =>
      Promise.resolve({ home: folder, abilities: [], places: [] }),
    );
    const properties = await system.files.properties(path);
    expect(properties).toMatchObject({
      name: 'photo.png',
      kind: 'file',
      size: 3,
      mimeType: 'image/png',
    });
    expect(Number.isNaN(Date.parse(properties.modifiedAt))).toBe(false);
    await expect(system.files.properties(join(folder, 'missing'))).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('gives what a file link and a thumbnail link are minted from', async () => {
    const path = join(folder, 'photo.png');
    await writeFile(path, 'png');
    const system = unsupportedSystem('macOS', () =>
      Promise.resolve({ home: folder, abilities: [], places: [] }),
    );
    const properties = await system.files.properties(path);
    expect(properties.kind).toBe('file');
    expect(hasPicture(properties.mimeType) && properties.size > 0).toBe(true);
    expect(thumbVersion(properties)).toMatch(/^[0-9a-f]{16}$/u);
  });
});

describe('choosing controls and readings by platform', () => {
  it('builds controls for Windows and macOS without starting any program', () => {
    captureLogs();
    const options = { now: (): Date => new Date(), log: testLogger('node') };
    expect(controlsFor('win32', options).machine).toBeDefined();
    expect(controlsFor('darwin', options).machine).toBeDefined();
  });

  it('builds readings for Windows and macOS and still refuses unknown systems', () => {
    captureLogs();
    const options = { log: testLogger('node'), machineId: 'b'.repeat(32), now: Date.now };
    expect(collectorFor('win32', options).readers.summary).toBeDefined();
    expect(collectorFor('darwin', options).readers.summary).toBeDefined();
    expect(() => collectorFor('freebsd', options)).toThrow(UnsupportedPlatformError);
  });
});

describe('the quick places of a Windows or Mac computer', () => {
  let home = '';

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'hub-places-'));
    await mkdir(join(home, 'Downloads'));
    await mkdir(join(home, 'Documents'));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it('lists home, the usual folders that exist, the root and the drives', async () => {
    const places = await userPlaces(
      () => Promise.resolve([{ label: 'D:', path: 'D:\\', kind: 'drive' as const }]),
      { label: 'Computer', path: '/', kind: 'root' },
      home,
    );
    expect(places.places.map((place) => [place.label, place.kind])).toStrictEqual([
      ['Home', 'home'],
      ['Downloads', 'folder'],
      ['Documents', 'folder'],
      ['Computer', 'root'],
      ['D:', 'drive'],
    ]);
  });

  it('leaves out the root where the system has none', async () => {
    const places = await userPlaces(() => Promise.resolve([]), null, home);
    expect(places.places.some((place) => place.kind === 'root')).toBe(false);
  });
});
