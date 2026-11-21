import type { AlbumActivity, DriveAlbum, PhotoSharing } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  activityAdded,
  activityReplaced,
  activityWithout,
  sharingWithMembers,
  sharingWithout,
} from './shown';

const NOW = '2026-11-21T10:00:00.000Z';

const ALBUM: DriveAlbum = {
  id: 'album-1',
  kind: 'manual',
  title: 'Trip',
  surface: 'photos',
  scope: 'person',
  ownerProfileId: 'owner',
  coverItemId: null,
  itemCount: 3,
  createdAt: NOW,
  updatedAt: NOW,
};

const EMPTY: PhotoSharing = { albums: [], partners: [], activity: [], unread: 0 };

function entry(id: string): AlbumActivity {
  return {
    id,
    albumId: ALBUM.id,
    itemId: null,
    profileId: 'owner',
    kind: 'like',
    text: null,
    createdAt: NOW,
  };
}

describe('album members shown at once', () => {
  it('adds the first members to an album that was not shared yet', () => {
    const shared = sharingWithMembers(EMPTY, ALBUM, [{ profileId: 'p1', role: 'viewer' }], NOW);
    expect(shared.albums[0]).toMatchObject({
      albumId: ALBUM.id,
      role: 'owner',
      members: [{ profileId: 'p1', role: 'viewer' }],
    });
  });

  it('changes a role and removes a member', () => {
    const shared = sharingWithMembers(EMPTY, ALBUM, [{ profileId: 'p1', role: 'viewer' }], NOW);
    const changed = sharingWithMembers(
      shared,
      ALBUM,
      [{ profileId: 'p1', role: 'contributor' }],
      NOW,
    );
    expect(changed.albums[0]?.members).toEqual([{ profileId: 'p1', role: 'contributor' }]);
    expect(sharingWithout(changed, ALBUM.id, 'p1').albums[0]?.members).toEqual([]);
  });
});

describe('album activity shown at once', () => {
  const pages = { pages: [{ items: [entry('old')], next: null }], pageParams: [null] };

  it('puts a new like first, swaps in the saved one and removes it', () => {
    const added = activityAdded(pages, entry('shown'));
    expect(added.pages[0]?.items.map((item) => item.id)).toEqual(['shown', 'old']);
    const saved = activityReplaced(added, 'shown', entry('saved'));
    expect(saved.pages[0]?.items.map((item) => item.id)).toEqual(['saved', 'old']);
    expect(activityWithout(saved, 'saved').pages[0]?.items.map((item) => item.id)).toEqual(['old']);
    expect(activityWithout(pages, 'missing')).toBe(pages);
  });
});
