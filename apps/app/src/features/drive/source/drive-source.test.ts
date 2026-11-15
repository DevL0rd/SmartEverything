import { describe, expect, it } from 'vitest';
import type { DriveItemLink } from '@smarteverything/domain';
import type { FileAbilities, FileLocation } from '../../files';
import {
  describeSourceContract,
  type ContractHarness,
} from '../../../test-support/file-source-contract';
import { driveAbilitiesOf } from './drive-abilities';
import { entriesOf, trashNodeOf, type DriveNode, type DriveOrigin } from './drive-node';
import { DRIVE_PLACES, drivePlaceKeyOf } from './drive-places';
import {
  createFakeDrive,
  MINE,
  HOME,
  VIEWER_ID,
  worldContext,
  type FakeDrive,
  OWNER_RIGHTS,
} from './drive-fixture';
import { createDriveSource, type DriveSourceEnv } from './drive-source';

function linkOf(itemId: string): DriveItemLink {
  const link = { url: `https://hub.test/files/${itemId}`, expiresAt: '2026-11-15T12:00:00.000Z' };
  return {
    itemId,
    rev: 1,
    file: link,
    download: link,
    icon: null,
    thumb: null,
    preview: null,
    playable: null,
  };
}

function envOf(fake: FakeDrive): DriveSourceEnv {
  return {
    roots: [MINE, HOME],
    viewerId: VIEWER_ID,
    clientId: 'client',
    online: true,
    phone: false,
    change: fake.env.change,
    setOffline: () => Promise.resolve(null),
    setLock: () => Promise.resolve(null),
    removeShortcut: fake.env.shortcuts.remove,
    updateShortcut: fake.env.shortcuts.update,
    createShortcut: fake.env.shortcuts.create,
    refresh: () => undefined,
    restore: fake.env.restore,
    request: () => undefined,
    start: (): never => {
      throw new Error('no upload in this test');
    },
    watch: () => () => undefined,
    download: {
      links: (ids) => Promise.resolve(ids.map(linkOf)),
      prepare: () => Promise.reject(new Error('no zip in this test')),
    },
  };
}

function rig(): ContractHarness<DriveOrigin> {
  const fake = createFakeDrive();
  const source = createDriveSource(envOf(fake));
  const context = worldContext();
  return {
    source,
    home: { place: DRIVE_PLACES.myDrive, folder: null },
    trash: { place: DRIVE_PLACES.trash, folder: null },
    list: (location: FileLocation): Promise<readonly DriveNode[]> =>
      Promise.resolve(
        location.place === DRIVE_PLACES.trash
          ? fake.trashEntries().map((entry) => trashNodeOf(entry, OWNER_RIGHTS))
          : entriesOf(fake.childrenOf(location.folder), [], context),
      ),
    abilities: (location: FileLocation): FileAbilities => {
      const place = drivePlaceKeyOf(location.place);
      if (place === null) throw new Error('an unknown place');
      return driveAbilitiesOf({
        place,
        atTop: location.folder === null,
        access: 'own',
        online: true,
        phone: false,
      });
    },
  };
}

describeSourceContract<DriveOrigin>('the Drive source', rig);

describe('the Drive source', () => {
  it('moves, copies and stars through the change endpoint', async () => {
    const fake = createFakeDrive();
    const source = createDriveSource(envOf(fake));
    const context = worldContext();
    const [docs, , plan] = entriesOf(fake.childrenOf(null), [], context);
    if (docs === undefined || plan === undefined) throw new Error('the seed has entries');
    await source.run({ kind: 'star', nodes: [plan] });
    await source.run({
      kind: 'move',
      nodes: [plan],
      to: { place: DRIVE_PLACES.myDrive, folder: docs.key },
    });
    expect(fake.calls.map((call) => call.action)).toEqual(['star', 'move']);
    expect(fake.items.get(plan.key)?.parentId).toBe(docs.key);
    expect(fake.items.get(plan.key)?.starred).toBe(true);
  });

  it('has no typed paths and says so', () => {
    const source = createDriveSource(envOf(createFakeDrive()));
    expect(source.locationOf('/home/dana')).toBeNull();
  });
});
