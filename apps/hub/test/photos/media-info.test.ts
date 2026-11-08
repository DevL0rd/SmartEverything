import { MEDIA_INFO, MEDIA_PROCESSING } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveReadService, type DriveActor } from '../../src/drive/service-read';
import { PhotoMedia } from '../../src/photos/media-routes';
import { DriveMediaJobsRepository } from '../../src/store/repositories/drive-media-jobs';
import { DriveMediaRepository } from '../../src/store/repositories/drive-media';
import { DrivePlacesRepository } from '../../src/store/repositories/drive-places';
import { testStore, type TestStore } from '../support/store';
import { folderRoot } from '../drive/drive-fixture';

const HOME = '0c000000-0000-4000-8000-000000000001';
const SAMS = '0c000000-0000-4000-8000-000000000002';
const PHOTO = '0c000000-0000-4000-8000-0000000000a1';
const PRIVATE = '0c000000-0000-4000-8000-0000000000a2';

let opened: TestStore;
let owner: DriveActor;
let sam: DriveActor;
let ann: DriveActor;
let media: PhotoMedia;
let jobs: DriveMediaJobsRepository;

function image(id: string, rootId: string): void {
  opened.store.driveItems.write({
    item: {
      id,
      rootId,
      parentId: null,
      relPath: `${id}.jpg`,
      name: `${id}.jpg`,
      modifiedAt: '2026-11-07T00:00:00.000Z',
      addedAt: '2026-11-07T00:00:00.000Z',
      starred: false,
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
      takenAt: null,
      width: null,
      height: null,
      orientation: null,
      camera: null,
      exposure: null,
      place: null,
    },
    identity: { dev: '1', ino: id.slice(-4) },
  });
}

beforeEach(async () => {
  opened = await testStore();
  const { store } = opened;
  owner = { profileId: store.profiles.first().id, owner: true };
  sam = { profileId: store.profiles.create({ name: 'Sam' }).id, owner: false };
  ann = { profileId: store.profiles.create({ name: 'Ann' }).id, owner: false };
  store.driveRoots.insert(folderRoot(HOME, '/library/home', { inPhotos: true }));
  store.driveRoots.insert(
    folderRoot(SAMS, '/library/sam', {
      scope: 'person',
      ownerProfileId: sam.profileId,
      indexId: 'index-2',
      inPhotos: true,
    }),
  );
  image(PHOTO, HOME);
  image(PRIVATE, SAMS);
  media = new PhotoMedia(store.context, new DriveReadService(store), store);
  jobs = new DriveMediaJobsRepository(store.context);
});

afterEach(async () => {
  await opened.close();
});

describe('media info', () => {
  it('answers how a photo was read and what is still being made', () => {
    new DrivePlacesRepository(opened.store.context).replaceAll([
      { id: '2267057', name: 'Lisbon', admin: 'Lisboa', country: 'PT', lat: 38.7, lon: -9.1 },
    ]);
    new DriveMediaRepository(opened.store.context).save({
      item_id: PHOTO,
      time_source: 'metadata',
      tz_offset_min: 60,
      thumbhash: null,
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
      place_id: '2267057',
    });
    jobs.enqueue({ kind: 'preview', itemId: PHOTO, rev: 1 });
    const info = MEDIA_INFO.parse(media.info(owner, PHOTO));
    expect(info).toMatchObject({
      timeSource: 'exif',
      tzOffsetMin: 60,
      placeId: 2267057,
      preview: { state: 'processing' },
      poster: { state: 'unsupported', reason: 'A photo has no poster.' },
      playable: { state: 'none' },
    });
  });

  it('answers an item the pipeline has not read yet and refuses one the person cannot see', () => {
    expect(MEDIA_INFO.parse(media.info(sam, PRIVATE))).toMatchObject({
      timeSource: null,
      preview: { state: 'none' },
    });
    expect(() => media.info(ann, PRIVATE)).toThrow();
  });
});

describe('media processing', () => {
  it('counts the waiting work and lists the failures of what the person may see', () => {
    jobs.enqueue({ kind: 'preview', itemId: PHOTO, rev: 1 });
    const failing = jobs.enqueue({ kind: 'playable_source', itemId: PRIVATE, rev: 1 });
    jobs.fail(failing.id, 'The file could not be decoded.');
    const mine = MEDIA_PROCESSING.parse(media.processing(sam));
    expect(mine).toMatchObject({ queued: 1, running: 0 });
    expect(mine.failed).toEqual([
      expect.objectContaining({ itemId: PRIVATE, kind: 'playable', state: 'failed' }),
    ]);
    const theirs = MEDIA_PROCESSING.parse(media.processing(ann));
    expect(theirs).toMatchObject({ queued: 1, failed: [] });
  });
});
