import { describe, expect, it } from 'vitest';
import {
  DRIVE_EDIT_ACTIONS,
  DRIVE_READ_VIEWS,
  LIBRARY_PAGE_QUERY,
  LIBRARY_SCOPE,
  LIVE_NOTICE,
  PHOTOS_AI_NOTICE,
  PHOTOS_PEOPLE_NOTICE,
  PHOTOS_CLIENT_PREFS,
  PHOTOS_ENDPOINTS,
  PHOTO_AI_MODELS_UPDATE,
  PHOTO_AI_SETTINGS,
  PHOTO_ANALYSIS,
  PHOTO_BOX,
  PHOTO_FACE,
  PHOTO_GROUP,
  PHOTO_GROUP_MERGE,
  PHOTO_GROUP_UPDATE,
  PHOTO_MERGE_SUGGESTION,
  USAGE_WORKS,
  USAGE_WORK_LABELS,
  PHOTO_LABEL,
} from '../../src';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-11-14T10:00:00Z';
const BOX = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };

const GROUP = {
  id: A,
  kind: 'person',
  name: 'Sam',
  species: null,
  linkedProfileId: B,
  coverFaceId: B,
  coverItemId: C,
  coverBox: BOX,
  hidden: false,
  count: 12,
  updatedAt: NOW,
};

describe('boxes and labels', () => {
  it('keeps a box inside the picture', () => {
    expect(PHOTO_BOX.safeParse(BOX).success).toBe(true);
    expect(PHOTO_BOX.safeParse({ x: 0, y: 0, w: 1, h: 1 }).success).toBe(true);
    expect(PHOTO_BOX.safeParse({ ...BOX, x: 0.8 }).success).toBe(false);
    expect(PHOTO_BOX.safeParse({ ...BOX, y: 0.7 }).success).toBe(false);
    expect(PHOTO_BOX.safeParse({ ...BOX, w: 0 }).success).toBe(false);
    expect(PHOTO_BOX.safeParse({ ...BOX, extra: 1 }).success).toBe(false);
  });

  it('refuses a label with a comma or no text', () => {
    expect(PHOTO_LABEL.safeParse(' beach ').data).toBe('beach');
    expect(PHOTO_LABEL.safeParse('sand, sea').success).toBe(false);
    expect(PHOTO_LABEL.safeParse('  ').success).toBe(false);
  });
});

describe('people and pets', () => {
  it('ties species to pets and links only people', () => {
    expect(PHOTO_GROUP.safeParse(GROUP).success).toBe(true);
    expect(PHOTO_GROUP.safeParse({ ...GROUP, species: 'dog' }).success).toBe(false);
    const pet = { ...GROUP, kind: 'pet', species: 'dog', linkedProfileId: null, name: null };
    expect(PHOTO_GROUP.safeParse(pet).success).toBe(true);
    expect(PHOTO_GROUP.safeParse({ ...pet, species: null }).success).toBe(false);
    expect(PHOTO_GROUP.safeParse({ ...pet, linkedProfileId: B }).success).toBe(false);
    expect(PHOTO_GROUP.safeParse({ ...GROUP, count: 0 }).success).toBe(false);
    expect(PHOTO_GROUP.safeParse({ ...GROUP, extra: 1 }).success).toBe(false);
  });

  it('describes a face with its group and refuses a name without one', () => {
    const face = { id: A, kind: 'person', species: null, box: BOX, groupId: B, groupName: 'Sam' };
    expect(PHOTO_FACE.safeParse(face).success).toBe(true);
    expect(PHOTO_FACE.safeParse({ ...face, groupId: null, groupName: null }).success).toBe(true);
    expect(PHOTO_FACE.safeParse({ ...face, groupId: null }).success).toBe(false);
    expect(PHOTO_FACE.safeParse({ ...face, species: 'cat' }).success).toBe(false);
    expect(PHOTO_FACE.safeParse({ ...face, kind: 'pet', species: null }).success).toBe(false);
  });

  it('suggests merging two different groups only', () => {
    expect(PHOTO_MERGE_SUGGESTION.safeParse({ groupIds: [A, B], similarity: 0.5 }).success).toBe(
      true,
    );
    expect(PHOTO_MERGE_SUGGESTION.safeParse({ groupIds: [A, A], similarity: 0.5 }).success).toBe(
      false,
    );
    expect(PHOTO_MERGE_SUGGESTION.safeParse({ groupIds: [A, B], similarity: 2 }).success).toBe(
      false,
    );
  });

  it('needs something to change and never merges a group into itself', () => {
    expect(PHOTO_GROUP_UPDATE.safeParse({}).success).toBe(false);
    expect(PHOTO_GROUP_UPDATE.safeParse({ name: null }).success).toBe(true);
    expect(PHOTO_GROUP_UPDATE.safeParse({ hidden: true, linkedProfileId: null }).success).toBe(
      true,
    );
    expect(PHOTO_GROUP_UPDATE.safeParse({ name: ' ' }).success).toBe(false);
    expect(PHOTO_GROUP_MERGE.safeParse({ targetId: A, sourceIds: [B, C] }).success).toBe(true);
    expect(PHOTO_GROUP_MERGE.safeParse({ targetId: A, sourceIds: [] }).success).toBe(false);
    expect(PHOTO_GROUP_MERGE.safeParse({ targetId: A, sourceIds: [A] }).success).toBe(false);
    expect(PHOTO_GROUP_MERGE.safeParse({ targetId: A, sourceIds: [B, B] }).success).toBe(false);
  });
});

describe('smart features', () => {
  it('needs one switch or one model to change', () => {
    expect(PHOTO_AI_SETTINGS.safeParse({}).success).toBe(false);
    expect(PHOTO_AI_SETTINGS.safeParse({ smartSearch: false }).success).toBe(true);
    expect(PHOTO_AI_SETTINGS.safeParse({ faceGrouping: true, extra: 1 }).success).toBe(false);
    expect(PHOTO_AI_MODELS_UPDATE.safeParse({}).success).toBe(false);
    expect(PHOTO_AI_MODELS_UPDATE.safeParse({ eraser: 'google/model' }).success).toBe(true);
    expect(PHOTO_AI_MODELS_UPDATE.safeParse({ vision: ' ' }).success).toBe(false);
  });

  it('lets only a finished analysis carry results', () => {
    const done = {
      itemId: A,
      state: 'done',
      caption: 'A dog on a beach',
      scene: 'beach',
      labels: ['dog', 'sand'],
      text: null,
    };
    expect(PHOTO_ANALYSIS.safeParse(done).success).toBe(true);
    const empty = {
      itemId: A,
      state: 'needs_key',
      caption: null,
      scene: null,
      labels: [],
      text: null,
    };
    expect(PHOTO_ANALYSIS.safeParse(empty).success).toBe(true);
    expect(PHOTO_ANALYSIS.safeParse({ ...empty, labels: ['dog'] }).success).toBe(false);
    expect(PHOTO_ANALYSIS.safeParse({ ...empty, state: 'failed', text: 'x' }).success).toBe(false);
    expect(PHOTO_ANALYSIS.safeParse({ ...empty, state: 'other' }).success).toBe(false);
  });

  it('keeps done within total in the progress notice and registers it as live', () => {
    const notice = { type: 'photos_ai', stage: 'faces', done: 2, total: 5 };
    expect(PHOTOS_AI_NOTICE.parse(notice)).toStrictEqual(notice);
    expect(LIVE_NOTICE.parse(notice)).toStrictEqual(notice);
    expect(PHOTOS_AI_NOTICE.safeParse({ ...notice, done: 6 }).success).toBe(false);
    expect(PHOTOS_AI_NOTICE.safeParse({ ...notice, stage: 'ocr' }).success).toBe(false);
  });

  it('registers the people changed notice for one person', () => {
    const notice = {
      type: 'photos_people_changed',
      profileId: '00000000-0000-4000-8000-000000000001',
    };
    expect(PHOTOS_PEOPLE_NOTICE.parse(notice)).toStrictEqual(notice);
    expect(LIVE_NOTICE.parse(notice)).toStrictEqual(notice);
    expect(PHOTOS_PEOPLE_NOTICE.safeParse({ type: 'photos_people_changed' }).success).toBe(false);
  });

  it('adds the Photos analysis usage work', () => {
    expect(USAGE_WORKS).toContain('photos');
    expect(USAGE_WORK_LABELS.photos).toBe('Photos analysis');
  });
});

describe('the library scope', () => {
  it('reads people, labels, text and meaning from the query string', () => {
    const scope = LIBRARY_SCOPE.parse({
      filter: 'all',
      groupIds: `${A},${B}`,
      labels: 'dog,beach',
      photoText: 'invoice',
      meaning: 'a sunny day',
    });
    expect(scope).toStrictEqual({
      filter: 'all',
      groupIds: [A, B],
      labels: ['dog', 'beach'],
      photoText: 'invoice',
      meaning: 'a sunny day',
    });
    expect(LIBRARY_PAGE_QUERY.safeParse({ filter: 'all', groupIds: A, cursor: 'x' }).success).toBe(
      true,
    );
  });

  it('refuses a group id that is not an id and empty refinements', () => {
    expect(LIBRARY_SCOPE.safeParse({ filter: 'all', groupIds: 'nope' }).success).toBe(false);
    expect(LIBRARY_SCOPE.safeParse({ filter: 'all', labels: '' }).success).toBe(false);
    expect(LIBRARY_SCOPE.safeParse({ filter: 'all', photoText: ' ' }).success).toBe(false);
    expect(LIBRARY_SCOPE.safeParse({ filter: 'all', meaning: '' }).success).toBe(false);
  });
});

describe('the preference and the endpoints', () => {
  it('adds the three switches to version four with the documented defaults', () => {
    const photos = PHOTOS_CLIENT_PREFS.photos;
    expect(photos.version).toBe(4);
    expect(photos.defaultValue).toMatchObject({
      smartSearch: false,
      faceGrouping: true,
      albumActivity: true,
    });
    expect(photos.decode({ version: 3, value: photos.defaultValue }).status).toBe('invalid');
    expect(photos.decode({ version: 4, value: photos.defaultValue }).status).toBe('stored');
  });

  it('serves every wave 2 endpoint once under the Photos path', () => {
    const wave2 = [
      'readPhotoAiStatus',
      'setPhotoAiSettings',
      'listPhotoAiModels',
      'setPhotoAiModels',
      'reanalysePhotos',
      'retryFailedPhotoAi',
      'readPhotoAnalysis',
      'suggestPhotoSearch',
      'listPhotoGroups',
      'readPhotoGroup',
      'updatePhotoGroup',
      'mergePhotoGroups',
      'dismissPhotoMergeSuggestion',
      'removePhotoGroupFaces',
      'readPhotoFaces',
      'readPhotoSharing',
      'setPhotoAlbumMembers',
      'removePhotoAlbumMember',
      'joinPhotoAlbum',
      'leavePhotoAlbum',
      'listPhotoAlbumActivity',
      'addPhotoAlbumActivity',
      'removePhotoAlbumActivity',
      'setPhotoPartner',
      'acceptPhotoPartner',
      'stopPhotoPartner',
      'savePartnerPhotos',
      'setPartnerAutoSave',
      'readPhotoEdit',
      'savePhotoEdit',
      'revertPhotoEdit',
      'erasePhotoArea',
      'editPhotoVideo',
      'readPhotoEditJob',
      'editPhotoMeta',
      'archivePhotos',
      'unarchivePhotos',
      'readPhotoArchived',
      'readArchiveBuckets',
      'readArchivePage',
      'readLockedState',
      'setLockedPin',
      'unlockLockedFolder',
      'lockLockedFolder',
      'readLockedBuckets',
      'readLockedPage',
      'readLockedLinks',
      'moveIntoLockedFolder',
      'moveOutOfLockedFolder',
      'deleteFromLockedFolder',
    ];
    for (const name of wave2) {
      expect(Object.keys(PHOTOS_ENDPOINTS), name).toContain(name);
    }
    const keys = Object.entries(PHOTOS_ENDPOINTS).map(
      ([, endpoint]) => `${endpoint.method} ${endpoint.path}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('adds the Photos views and actions to drive_read and drive_edit once', () => {
    for (const view of [
      'people',
      'person',
      'item_faces',
      'sharing',
      'album_activity',
      'archive',
      'smart_status',
    ]) {
      expect(DRIVE_READ_VIEWS).toContain(view);
    }
    for (const action of [
      'person_update',
      'photo_edit',
      'video_edit',
      'photo_meta',
      'archive',
      'locked_move_in',
      'smart_reanalyse',
    ]) {
      expect(DRIVE_EDIT_ACTIONS).toContain(action);
    }
    expect(new Set(DRIVE_READ_VIEWS).size).toBe(DRIVE_READ_VIEWS.length);
    expect(new Set(DRIVE_EDIT_ACTIONS).size).toBe(DRIVE_EDIT_ACTIONS.length);
    expect(DRIVE_READ_VIEWS).not.toContain('locked');
    expect(DRIVE_EDIT_ACTIONS).not.toContain('locked_move_out');
    expect(DRIVE_EDIT_ACTIONS).not.toContain('locked_unlock');
  });
});
