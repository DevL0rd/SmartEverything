import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homeLocation, homeZone } from '../../src/automations/world-v3/zone';
import type { DriveActor } from '../../src/drive/access';
import { InsightsReader } from '../../src/photos/insights';
import { RailCountsReader } from '../../src/photos/insights-rail';
import { LibraryReader } from '../../src/photos/library';
import { PlaceQueries } from '../../src/photos/places-queries';
import { SharingReader } from '../../src/photos/sharing/reads';
import { AlbumSeen } from '../../src/photos/sharing/seen';
import { PhotoFolderService } from '../../src/photos/folder-service';
import { StacksService } from '../../src/photos/stacks';
import { localDay } from '../../src/photos/insights-shapes';
import { DriveMediaRepository } from '../../src/store/repositories/drive-media';
import type { TestStore } from '../support/store';
import { sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from '../drive/spaces-fixture';

const HOME = '0c000000-0000-4000-8000-000000000001';
const PHOTO = '0c000000-0000-4000-8000-0000000000a1';
const TAKEN = '2026-03-04T10:00:00.000Z';

let opened: TestStore;
let owner: DriveActor;

beforeEach(async () => {
  opened = await driveTestStore();
  const { store } = opened;
  owner = { profileId: store.profiles.first().id };
  store.driveRoots.insert(sharedDriveRoot(HOME));
  store.driveItems.write({
    item: {
      id: PHOTO,
      rootId: HOME,
      parentId: null,
      relPath: 'a.jpg',
      name: 'a.jpg',
      modifiedAt: TAKEN,
      addedAt: TAKEN,
      starred: false,
      shared: false,
      outside: false,
      remoteId: null,
      remoteRev: null,
      addedByProfileId: null,
      kind: 'image',
      mime: 'image/jpeg',
      bytes: 10,
      sha256: null,
      integrity: 'unknown',
      thumb: { state: 'none' },
      takenAt: TAKEN,
      width: 4,
      height: 3,
      orientation: null,
      camera: null,
      exposure: null,
      place: null,
    },
    identity: { dev: '1', ino: '00a1' },
  });
  store.context.sql.run(
    'put the photo in the library',
    'insert into drive_photo_library (item_id, root_id) values ($item, $root)',
    { item: PHOTO, root: HOME },
  );
  new DriveMediaRepository(store.context).save({
    item_id: PHOTO,
    time_source: 'metadata',
    tz_offset_min: 0,
    preview_state: 'none',
    preview_reason: null,
    poster_state: 'unsupported',
    poster_reason: 'A photo has no poster.',
    playable_state: 'none',
    playable_reason: null,
    motion_clip_id: null,
    live_id: null,
    burst_id: null,
    stem_key: null,
    stack_id: null,
    place_id: null,
  });
});

afterEach(async () => {
  await opened.close();
});

describe('photo reads served by the store host', () => {
  it('answers the library, insights, rail, places and stacks as the main thread would', async () => {
    const { store } = opened;
    const timeZone = homeZone(store);
    const library = new LibraryReader(store.context, () => timeZone);
    const scope = { filter: 'all' } as const;
    expect(library.buckets(owner, scope)).toEqual([{ month: '2026-03', count: 1 }]);
    expect(
      await store.host.read('photoBuckets', { actor: owner, scope, meaning: [], timeZone }),
    ).toEqual(library.buckets(owner, scope));
    expect(
      await store.host.read('photoPage', {
        actor: owner,
        month: '2026-03',
        query: scope,
        meaning: [],
        timeZone,
      }),
    ).toEqual(library.page(owner, '2026-03', scope));
    const at = { today: localDay(store.now(), timeZone), home: homeLocation(store) };
    expect(await store.host.read('photoInsights', { actor: owner, range: 'all_time' })).toEqual(
      new InsightsReader(store.context).read(owner, 'all_time', at),
    );
    const sharing = new SharingReader(store, new AlbumSeen(store));
    expect(await store.host.read('photoRailCounts', { actor: owner })).toEqual(
      new RailCountsReader(store.context, (actor) => sharing.unread(actor)).read(owner),
    );
    expect(await store.host.read('photoSharing', { actor: owner })).toEqual(sharing.read(owner));
    expect(await store.host.write('photoPartnerAutoSave', {})).toBe(0);
    expect(await store.host.read('photoPlaceList', { actor: owner })).toEqual(
      new PlaceQueries(store.context).list(owner),
    );
    expect(await store.host.read('photoStacks', { actor: owner, cursor: undefined })).toEqual(
      new StacksService(store.context).list(owner, undefined),
    );
  });

  it('hides a photo folder in one host write and delivers its notice on the main feed', async () => {
    const { store } = opened;
    const notices: unknown[] = [];
    store.feed.subscribeNotices((notice) => notices.push(notice));
    const change = { key: `drive:${HOME}`, name: 'Home', hidden: true };
    const hidden = await store.host.write('photoFolderHidden', { actor: owner, change });
    expect(hidden.folders.map((folder) => folder.key)).toEqual([change.key]);
    expect(notices).toEqual([{ type: 'photos_folders_changed', profileId: owner.profileId }]);
    expect(await store.host.read('photoHiddenFolders', { actor: owner })).toEqual(hidden);
    expect(await store.host.read('photoFolders', { actor: owner })).toEqual(
      new PhotoFolderService(store, () => store.now()).list(owner),
    );
  });

  it('archives a photo in the writer host and reads the archive back on a reader host', async () => {
    const { store } = opened;
    const scope = { filter: 'all' } as const;
    const request = { itemIds: [PHOTO] };
    expect(await store.host.write('photoArchive', { actor: owner, request })).toEqual({ count: 1 });
    expect(await store.host.read('photoArchived', { actor: owner, itemId: PHOTO })).toEqual({
      archived: true,
    });
    expect(await store.host.read('photoArchiveBuckets', { actor: owner, scope })).toEqual([
      { month: '2026-03', count: 1 },
    ]);
    expect(await store.host.write('photoUnarchive', { actor: owner, request })).toEqual({
      count: 1,
    });
    expect(await store.host.read('photoArchiveBuckets', { actor: owner, scope })).toEqual([]);
  });
});
