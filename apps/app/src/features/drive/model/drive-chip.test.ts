import { describe, expect, it } from 'vitest';
import {
  MEMBER_ID,
  OTHER_ROOT_ID,
  OWNER_ID,
  ROOT_ID,
  personalRootRow,
  rootRow,
} from '../data/fixtures';
import {
  driveChipsOf,
  driveFilterCounts,
  driveFilterMatches,
  drivePathOf,
  folderTrailOf,
  inDrive,
} from './drive-chip';

const THEIR_ROOT = 'a1b2c3d4-0000-4000-8000-000000000020';
const UNSEEN_ROOT = 'a1b2c3d4-0000-4000-8000-000000000021';

const chipOf = driveChipsOf({
  roots: [rootRow(ROOT_ID, 'ready'), personalRootRow(OTHER_ROOT_ID, OWNER_ID)],
  viewerId: OWNER_ID,
  sharerOfRoot: new Map([[THEIR_ROOT, MEMBER_ID]]),
  names: new Map([[MEMBER_ID, 'Anna']]),
});

describe('drive chips', () => {
  it('names the viewer’s own drive, the Shared Drive and the person who shared an item', () => {
    expect(chipOf(OTHER_ROOT_ID).label).toBe('My Drive');
    expect(chipOf(ROOT_ID).label).toBe('Shared Drive');
    expect(chipOf(THEIR_ROOT)).toMatchObject({ key: 'with-me', label: 'Anna' });
  });

  it('calls an item from a drive whose sharer is not known yet shared with me', () => {
    expect(chipOf(UNSEEN_ROOT)).toMatchObject({ key: 'with-me', label: 'Shared with me' });
  });

  it('shows the folder trail inside your own drives and never the folders above a shared item', () => {
    expect(drivePathOf(chipOf(OTHER_ROOT_ID), 'Home/Taxes/Return.pdf')).toBe(
      'My Drive › Home › Taxes',
    );
    expect(drivePathOf(chipOf(THEIR_ROOT), 'Private/Taxes/Return.pdf')).toBe('Shared by Anna');
    expect(drivePathOf(chipOf(UNSEEN_ROOT), 'Private/Return.pdf')).toBe('Shared with me');
    expect(folderTrailOf(chipOf(ROOT_ID), 'Home/Return.pdf')).toBe('Home');
    expect(folderTrailOf(chipOf(THEIR_ROOT), 'Private/Return.pdf')).toBe('');
  });

  it('filters and counts entries by drive', () => {
    const roots = [OTHER_ROOT_ID, ROOT_ID, THEIR_ROOT, ROOT_ID];
    expect(inDrive(roots, 'shared-drive', chipOf)).toEqual([ROOT_ID, ROOT_ID]);
    expect(inDrive(roots, 'all', chipOf)).toBe(roots);
    expect(driveFilterCounts(roots, chipOf)).toEqual({
      all: 4,
      mine: 1,
      'shared-drive': 2,
      'with-me': 1,
    });
    expect(driveFilterMatches('with-me', chipOf(THEIR_ROOT))).toBe(true);
    expect(driveFilterMatches('mine', chipOf(THEIR_ROOT))).toBe(false);
  });
});
