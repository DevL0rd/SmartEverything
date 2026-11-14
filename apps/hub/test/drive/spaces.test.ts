import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DriveSpaceMissingError,
  ensureDrives,
  personalDrive,
  sharedDrive,
} from '../../src/drive/spaces';
import { MARKER_FILE } from '../../src/drive/root-marker';
import { captureLogs } from '../support/logs';
import type { TestStore } from '../support/store';
import { driveTestStore } from './spaces-fixture';

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await driveTestStore();
});

afterEach(async () => {
  await opened.close();
});

describe('ensureDrives', () => {
  it('creates the Shared Drive and one drive per profile with a private folder and a marker', async () => {
    const { store, layout } = opened;
    const robin = store.profiles.first();
    const sam = store.profiles.create({ name: 'Sam' });
    const drives = await ensureDrives(store, layout, store.profiles.list());
    expect(drives).toHaveLength(3);
    expect(sharedDrive(store).path).toBe(layout.home.drive);
    expect(personalDrive(store, robin.id).path).toBe(layout.person(robin.id).drive);
    expect(personalDrive(store, sam.id).ownerProfileId).toBe(sam.id);
    for (const drive of drives) {
      expect((await stat(drive.path)).mode & 0o777).toBe(0o700);
      const marker = z
        .object({ id: z.string() })
        .parse(JSON.parse(await readFile(join(drive.path, MARKER_FILE), 'utf8')));
      expect(marker.id).toBe(drive.id);
    }
  });

  it('is idempotent and adds only the drive of a new profile', async () => {
    const { store, layout } = opened;
    const first = await ensureDrives(store, layout, store.profiles.list());
    const again = await ensureDrives(store, layout, store.profiles.list());
    expect(again.map((drive) => drive.id)).toEqual(first.map((drive) => drive.id));
    const kim = store.profiles.create({ name: 'Kim' });
    await ensureDrives(store, layout, store.profiles.list());
    expect(store.driveRoots.list()).toHaveLength(3);
    expect(personalDrive(store, kim.id).id).not.toBe(sharedDrive(store).id);
  });

  it('keeps the marker and the user files of an existing drive', async () => {
    const { store, layout } = opened;
    const [shared] = await ensureDrives(store, layout, []);
    if (shared === undefined) throw new Error('no Shared Drive');
    await mkdir(join(shared.path, 'Photos'), { recursive: true });
    await writeFile(join(shared.path, 'Photos', 'a.txt'), 'keep');
    const marker = await readFile(join(shared.path, MARKER_FILE), 'utf8');
    await ensureDrives(store, layout, []);
    expect(await readFile(join(shared.path, MARKER_FILE), 'utf8')).toBe(marker);
    expect(await readFile(join(shared.path, 'Photos', 'a.txt'), 'utf8')).toBe('keep');
  });

  it('keeps a readable marker and refuses an unreadable one', async () => {
    const { store, layout } = opened;
    const [shared] = await ensureDrives(store, layout, []);
    if (shared === undefined) throw new Error('no Shared Drive');
    await expect(ensureDrives(store, layout, [])).resolves.toHaveLength(1);
    await writeFile(join(shared.path, MARKER_FILE), 'not json');
    await expect(ensureDrives(store, layout, [])).rejects.toMatchObject({ failure: 'invalid' });
  });
});

describe('finding a drive', () => {
  it('names the missing drive when none exists yet', () => {
    const { store } = opened;
    expect(() => sharedDrive(store)).toThrow(DriveSpaceMissingError);
    expect(() => personalDrive(store, store.profiles.first().id)).toThrow(DriveSpaceMissingError);
  });
});
