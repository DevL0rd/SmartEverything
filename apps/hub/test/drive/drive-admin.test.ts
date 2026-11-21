import { ApiError } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveReadService } from '../../src/drive/service-read';
import { DriveAdmin } from '../../src/drive/service-write-drives';
import type { DriveCaller } from '../../src/drive/service-write-support';
import type { TestStore } from '../support/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from './spaces-fixture';

const SHARED = '0d000000-0000-4000-8000-000000000001';
const OWNER_DRIVE = '0d000000-0000-4000-8000-000000000002';
const MEMBER_DRIVE = '0d000000-0000-4000-8000-000000000003';

let opened: TestStore;
let admin: DriveAdmin;
let scans: string[];
let owner: DriveCaller;
let member: DriveCaller;

function callerOf(profileId: string, isOwner: boolean): DriveCaller {
  return { profileId, owner: isOwner, via: 'app', deviceId: null };
}

beforeEach(async () => {
  opened = await driveTestStore();
  const { store } = opened;
  const ownerId = store.profiles.first().id;
  const memberId = store.profiles.create({ name: 'Robin' }).id;
  store.driveRoots.insert(sharedDriveRoot(SHARED));
  store.driveRoots.insert(personalDriveRoot(OWNER_DRIVE, ownerId));
  store.driveRoots.insert(personalDriveRoot(MEMBER_DRIVE, memberId));
  owner = callerOf(ownerId, true);
  member = callerOf(memberId, false);
  scans = [];
  admin = new DriveAdmin({
    store,
    read: new DriveReadService(store),
    scan: (rootId): void => {
      scans.push(rootId);
    },
  });
});

afterEach(async () => {
  await opened.close();
});

describe('drive settings', () => {
  it('lets a person change the settings of their own drive and rescans when the walk changes', async () => {
    const changed = await admin.update(member, MEMBER_DRIVE, { skipPatterns: ['*.tmp'] });
    expect(changed).toMatchObject({ id: MEMBER_DRIVE, skipPatterns: ['*.tmp'] });
    expect('path' in changed).toBe(false);
    expect(scans).toEqual([MEMBER_DRIVE]);
    await admin.update(member, MEMBER_DRIVE, { versions: false });
    expect(opened.store.driveRoots.byId(MEMBER_DRIVE).versions).toBe(false);
    expect(scans).toEqual([MEMBER_DRIVE]);
  });

  it('refuses everyone but the owner on the Shared Drive', async () => {
    await expect(admin.update(member, SHARED, { includeHidden: true })).rejects.toThrow(ApiError);
    expect(await admin.update(owner, SHARED, { includeHidden: true })).toMatchObject({
      includeHidden: true,
    });
    expect(scans).toEqual([SHARED]);
  });

  it('hides another person drive from everyone, the owner included', async () => {
    await expect(admin.update(owner, MEMBER_DRIVE, { versions: false })).rejects.toThrow(
      /no such drive/,
    );
    await expect(admin.scan(owner, MEMBER_DRIVE)).rejects.toThrow(/no such drive/);
    await expect(admin.scan(member, OWNER_DRIVE)).rejects.toThrow(/no such drive/);
    expect(scans).toEqual([]);
  });

  it('scans a drive the caller may settle', async () => {
    await admin.scan(member, MEMBER_DRIVE);
    await admin.scan(owner, SHARED);
    expect(scans).toEqual([MEMBER_DRIVE, SHARED]);
  });
});
