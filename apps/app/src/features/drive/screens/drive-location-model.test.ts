import { describe, expect, it } from 'vitest';
import type { DriveRoot } from '@smarteverything/domain';
import { FOLDER_ID, MEMBER_ID, OTHER_ROOT_ID, OWNER_ID, ROOT_ID, rootRow } from '../data/fixtures';
import { DRIVE_PLACES } from '../source/drive-places';
import { driveHrefOf, driveSectionOf, folderLocationOf, placeOfRoot } from './drive-location-model';

const MINE_ID = 'a1b2c3d4-0000-4000-8000-000000000020';

const HOME: DriveRoot = rootRow(ROOT_ID, 'ready');

const MINE: DriveRoot = { ...rootRow(MINE_ID, 'ready'), scope: 'person', ownerProfileId: OWNER_ID };

const THEIRS: DriveRoot = {
  ...rootRow(OTHER_ROOT_ID, 'ready'),
  scope: 'person',
  ownerProfileId: MEMBER_ID,
};

const ROOTS = [HOME, MINE, THEIRS];

describe('Drive browser routes', () => {
  it('lights the rail section of each place', () => {
    expect(driveSectionOf({ place: DRIVE_PLACES.myDrive, folder: null })).toBe('index');
    expect(driveSectionOf({ place: DRIVE_PLACES.sharedDrive, folder: FOLDER_ID })).toBe(
      'shared-drive',
    );
    expect(driveSectionOf({ place: DRIVE_PLACES.sharedWithMe, folder: FOLDER_ID })).toBe('shared');
    expect(driveSectionOf({ place: DRIVE_PLACES.trash, folder: null })).toBe('trash');
  });

  it('opens a folder on its folder route and a place on its page', () => {
    expect(driveHrefOf({ place: DRIVE_PLACES.myDrive, folder: FOLDER_ID })).toEqual({
      pathname: '/drive/folder/[folderId]',
      params: { folderId: FOLDER_ID },
    });
    expect(driveHrefOf({ place: DRIVE_PLACES.myDrive, folder: null })).toBe('/drive');
    expect(driveHrefOf({ place: DRIVE_PLACES.sharedDrive, folder: null })).toEqual({
      pathname: '/drive/shared-drive',
      params: {},
    });
    expect(driveHrefOf({ place: DRIVE_PLACES.sharedWithMe, folder: null })).toEqual({
      pathname: '/drive/shared',
      params: {},
    });
    expect(driveHrefOf({ place: DRIVE_PLACES.trash, folder: FOLDER_ID })).toEqual({
      pathname: '/drive/trash',
      params: {},
    });
  });

  it('refuses a place Drive does not have', () => {
    expect(() => driveSectionOf({ place: 'home', folder: null })).toThrow(
      'There is no Drive place',
    );
    expect(() => driveHrefOf({ place: 'home', folder: null })).toThrow('There is no Drive place');
  });

  it('places a folder in the drive it lives in, as the viewer sees it', () => {
    expect(placeOfRoot(ROOTS, MINE_ID, OWNER_ID)).toBe(DRIVE_PLACES.myDrive);
    expect(placeOfRoot(ROOTS, ROOT_ID, OWNER_ID)).toBe(DRIVE_PLACES.sharedDrive);
    expect(placeOfRoot(ROOTS, OTHER_ROOT_ID, OWNER_ID)).toBe(DRIVE_PLACES.sharedWithMe);
    expect(placeOfRoot([HOME], MINE_ID, MEMBER_ID)).toBe(DRIVE_PLACES.sharedWithMe);
    expect(folderLocationOf(ROOTS, { id: FOLDER_ID, rootId: OTHER_ROOT_ID }, MEMBER_ID)).toEqual({
      place: DRIVE_PLACES.myDrive,
      folder: FOLDER_ID,
    });
  });
});
