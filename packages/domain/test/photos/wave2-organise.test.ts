import { describe, expect, it } from 'vitest';
import {
  ALBUM_ACTIVITY,
  ALBUM_ACTIVITY_CREATE,
  ALBUM_MEMBERS_SET,
  DRIVE_SHARE,
  DRIVE_SHARE_CREATE,
  EDIT_JOB,
  LIVE_NOTICE,
  LOCKED_PIN_SET,
  PARTNER_SET,
  PARTNER_SHARE,
  PHOTOS_ACTIVITY_NOTICE,
  PHOTO_EDIT,
  PHOTO_META_PATCH,
  VIDEO_EDIT,
} from '../../src';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-11-14T10:00:00Z';

describe('sharing', () => {
  it('names each person once with a role', () => {
    const members = [
      { profileId: A, role: 'contributor' },
      { profileId: B, role: 'viewer' },
    ];
    expect(ALBUM_MEMBERS_SET.safeParse({ members }).success).toBe(true);
    expect(ALBUM_MEMBERS_SET.safeParse({ members: [] }).success).toBe(false);
    expect(ALBUM_MEMBERS_SET.safeParse({ members: [members[0], members[0]] }).success).toBe(false);
    expect(
      ALBUM_MEMBERS_SET.safeParse({ members: [{ profileId: A, role: 'owner' }] }).success,
    ).toBe(false);
  });

  it('ties text to comments and the photo to adds', () => {
    const base = { id: A, albumId: B, itemId: null, profileId: C, createdAt: NOW };
    expect(ALBUM_ACTIVITY.safeParse({ ...base, kind: 'comment', text: 'Lovely' }).success).toBe(
      true,
    );
    expect(ALBUM_ACTIVITY.safeParse({ ...base, kind: 'comment', text: null }).success).toBe(false);
    expect(ALBUM_ACTIVITY.safeParse({ ...base, kind: 'like', text: 'hi' }).success).toBe(false);
    expect(ALBUM_ACTIVITY.safeParse({ ...base, kind: 'like', text: null }).success).toBe(true);
    expect(ALBUM_ACTIVITY.safeParse({ ...base, kind: 'added', text: null }).success).toBe(false);
    expect(
      ALBUM_ACTIVITY.safeParse({ ...base, itemId: A, kind: 'added', text: null }).success,
    ).toBe(true);
    expect(ALBUM_ACTIVITY.safeParse({ ...base, kind: 'joined', text: null }).success).toBe(true);
  });

  it('takes a comment with text or a like, on the album or one photo', () => {
    expect(ALBUM_ACTIVITY_CREATE.safeParse({ kind: 'comment', text: 'Nice' }).success).toBe(true);
    expect(ALBUM_ACTIVITY_CREATE.safeParse({ kind: 'like', itemId: A }).success).toBe(true);
    expect(ALBUM_ACTIVITY_CREATE.safeParse({ kind: 'comment' }).success).toBe(false);
    expect(ALBUM_ACTIVITY_CREATE.safeParse({ kind: 'like', text: 'x' }).success).toBe(false);
    expect(ALBUM_ACTIVITY_CREATE.safeParse({ kind: 'joined' }).success).toBe(false);
  });

  it('matches the partner scope to the chosen people', () => {
    const all = { recipientId: B, scope: 'all', groupIds: [], fromDay: '2026-01-01' };
    expect(PARTNER_SET.safeParse(all).success).toBe(true);
    expect(PARTNER_SET.safeParse({ ...all, groupIds: [A] }).success).toBe(false);
    expect(PARTNER_SET.safeParse({ ...all, scope: 'people' }).success).toBe(false);
    expect(PARTNER_SET.safeParse({ ...all, scope: 'people', groupIds: [A] }).success).toBe(true);
    expect(PARTNER_SET.safeParse({ ...all, fromDay: 'soon' }).success).toBe(false);
    const share = {
      id: A,
      sharerId: B,
      recipientId: C,
      scope: 'all',
      groupIds: [],
      fromDay: '2026-01-01',
      state: 'offered',
      autoSave: false,
      createdAt: NOW,
    };
    expect(PARTNER_SHARE.safeParse(share).success).toBe(true);
    expect(PARTNER_SHARE.safeParse({ ...share, recipientId: B }).success).toBe(false);
    expect(PARTNER_SHARE.safeParse({ ...share, state: 'paused' }).success).toBe(false);
    expect(PARTNER_SHARE.safeParse({ ...share, scope: 'people' }).success).toBe(false);
  });

  it('carries the activity notice', () => {
    const notice = { type: 'photos_activity', albumId: A, kind: 'comment' };
    expect(PHOTOS_ACTIVITY_NOTICE.parse(notice)).toStrictEqual(notice);
    expect(LIVE_NOTICE.parse(notice)).toStrictEqual(notice);
    expect(PHOTOS_ACTIVITY_NOTICE.safeParse({ ...notice, kind: 'share' }).success).toBe(false);
  });

  it('names the invited person on an invited notice and on no other', () => {
    const invited = { type: 'photos_activity', albumId: A, kind: 'invited', profileId: B };
    expect(PHOTOS_ACTIVITY_NOTICE.parse(invited)).toStrictEqual(invited);
    expect(LIVE_NOTICE.parse(invited)).toStrictEqual(invited);
    expect(PHOTOS_ACTIVITY_NOTICE.safeParse({ ...invited, profileId: undefined }).success).toBe(
      false,
    );
    expect(
      PHOTOS_ACTIVITY_NOTICE.safeParse({
        type: 'photos_activity',
        albumId: A,
        kind: 'like',
        profileId: B,
      }).success,
    ).toBe(false);
  });

  it('carries the partner notice to both people', () => {
    const notice = {
      type: 'photos_partner',
      shareId: A,
      sharerId: B,
      recipientId: C,
      state: 'offered',
    };
    expect(LIVE_NOTICE.parse(notice)).toStrictEqual(notice);
    expect(LIVE_NOTICE.safeParse({ ...notice, state: 'paused' }).success).toBe(false);
  });

  it('shares an album through the one link shape', () => {
    const create = { permission: 'view', expiresAt: null, password: null };
    expect(DRIVE_SHARE_CREATE.safeParse({ ...create, itemId: A }).success).toBe(true);
    expect(DRIVE_SHARE_CREATE.safeParse({ ...create, albumId: A }).success).toBe(true);
    expect(DRIVE_SHARE_CREATE.safeParse(create).success).toBe(false);
    expect(DRIVE_SHARE_CREATE.safeParse({ ...create, itemId: A, albumId: B }).success).toBe(false);
    const share = {
      id: A,
      itemId: B,
      albumId: null,
      permission: 'view',
      expiresAt: null,
      hasPassword: false,
      createdBy: C,
      revokedAt: null,
      opens: 0,
      downloads: 0,
      lastOpenedAt: null,
    };
    expect(DRIVE_SHARE.safeParse(share).success).toBe(true);
    expect(DRIVE_SHARE.safeParse({ ...share, itemId: null, albumId: B }).success).toBe(true);
    expect(DRIVE_SHARE.safeParse({ ...share, itemId: null }).success).toBe(false);
    expect(DRIVE_SHARE.safeParse({ ...share, albumId: B }).success).toBe(false);
  });
});

describe('editing', () => {
  it('says why a photo can only be saved as a copy', () => {
    const edit = {
      itemId: A,
      recipe: null,
      baseVersionId: null,
      edited: false,
      canEdit: true,
      canSaveVersion: true,
      copyOnlyReason: null,
    };
    expect(PHOTO_EDIT.safeParse(edit).success).toBe(true);
    expect(
      PHOTO_EDIT.safeParse({
        ...edit,
        canSaveVersion: false,
        copyOnlyReason: 'HEIC photos are saved as copies',
      }).success,
    ).toBe(true);
    expect(PHOTO_EDIT.safeParse({ ...edit, canSaveVersion: false }).success).toBe(false);
    expect(PHOTO_EDIT.safeParse({ ...edit, copyOnlyReason: 'why' }).success).toBe(false);
  });

  it('needs a trim, stabilize or both and a trim that moves forward', () => {
    const edit = { trim: { startMs: 1000, endMs: 5000 }, stabilize: false, mode: 'version' };
    expect(VIDEO_EDIT.safeParse(edit).success).toBe(true);
    expect(VIDEO_EDIT.safeParse({ ...edit, trim: null, stabilize: true }).success).toBe(true);
    expect(VIDEO_EDIT.safeParse({ ...edit, trim: null }).success).toBe(false);
    expect(VIDEO_EDIT.safeParse({ ...edit, trim: { startMs: 5000, endMs: 5000 } }).success).toBe(
      false,
    );
    expect(VIDEO_EDIT.safeParse({ ...edit, mode: 'overwrite' }).success).toBe(false);
  });

  it('ties a job result and error to its state', () => {
    const job = {
      id: A,
      itemId: B,
      state: 'running',
      progress: 0.4,
      resultItemId: null,
      error: null,
    };
    expect(EDIT_JOB.safeParse(job).success).toBe(true);
    expect(
      EDIT_JOB.safeParse({ ...job, state: 'done', progress: 1, resultItemId: C }).success,
    ).toBe(true);
    expect(EDIT_JOB.safeParse({ ...job, state: 'done', progress: 1 }).success).toBe(false);
    expect(
      EDIT_JOB.safeParse({ ...job, state: 'done', progress: 0.5, resultItemId: C }).success,
    ).toBe(false);
    expect(EDIT_JOB.safeParse({ ...job, resultItemId: C }).success).toBe(false);
    expect(EDIT_JOB.safeParse({ ...job, state: 'failed', error: 'ffmpeg failed' }).success).toBe(
      true,
    );
    expect(EDIT_JOB.safeParse({ ...job, state: 'failed' }).success).toBe(false);
    expect(EDIT_JOB.safeParse({ ...job, error: 'x' }).success).toBe(false);
    expect(EDIT_JOB.safeParse({ ...job, progress: 2 }).success).toBe(false);
  });
});

describe('organising', () => {
  it('needs a date, a location or both, with a shift that moves', () => {
    const set = { kind: 'set', takenAt: '2026-05-01T10:00:00+02:00' };
    expect(PHOTO_META_PATCH.safeParse({ itemIds: [A], date: set }).success).toBe(true);
    expect(PHOTO_META_PATCH.safeParse({ itemIds: [A], location: null }).success).toBe(true);
    expect(
      PHOTO_META_PATCH.safeParse({
        itemIds: [A, B],
        date: { kind: 'shift', minutes: -90 },
        location: { latitude: 48.1, longitude: 11.5, label: 'Munich' },
      }).success,
    ).toBe(true);
    expect(PHOTO_META_PATCH.safeParse({ itemIds: [A] }).success).toBe(false);
    expect(PHOTO_META_PATCH.safeParse({ itemIds: [], location: null }).success).toBe(false);
    expect(
      PHOTO_META_PATCH.safeParse({ itemIds: [A], date: { kind: 'shift', minutes: 0 } }).success,
    ).toBe(false);
    expect(
      PHOTO_META_PATCH.safeParse({
        itemIds: [A],
        location: { latitude: 91, longitude: 0, label: null },
      }).success,
    ).toBe(false);
    expect(
      PHOTO_META_PATCH.safeParse({ itemIds: [A], date: { kind: 'set', takenAt: 'May' } }).success,
    ).toBe(false);
  });

  it('wants a PIN of digits, at least four', () => {
    expect(LOCKED_PIN_SET.safeParse({ pin: '1234', currentPin: null }).success).toBe(true);
    expect(LOCKED_PIN_SET.safeParse({ pin: '12345678901234', currentPin: '1234' }).success).toBe(
      true,
    );
    expect(LOCKED_PIN_SET.safeParse({ pin: '123', currentPin: null }).success).toBe(false);
    expect(LOCKED_PIN_SET.safeParse({ pin: '12ab', currentPin: null }).success).toBe(false);
    expect(LOCKED_PIN_SET.safeParse({ pin: '1234' }).success).toBe(false);
  });
});
