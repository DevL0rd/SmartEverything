import { testStore, type TestStore, type SeededStore } from '../support/store';
import { randomUUID } from 'node:crypto';
import { type ClientRow, type EndpointName, type ProfileRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OperatingContext } from '../../src/extensions/mcp/tools/acting';
import { DRIVE_EDIT } from '../../src/extensions/mcp/tools/drive-edits';
import { operatingContext, selected, type Answers, type Call } from './mcp-rig';
import { captureLogs } from '../support/logs';

const ITEM = randomUUID();
const ALBUM = randomUUID();

const GROUP = randomUUID();
const PROFILE = randomUUID();
const ACTIVITY = randomUUID();
const SHARE = randomUUID();

function callsOf(): [EndpointName, unknown][] {
  return calls.map((call) => [call.name, call.body]);
}

let opened: TestStore;
let calls: Call[];
let answers: Answers;
let owner: ClientRow;
let ownerProfile: ProfileRow;
let context: OperatingContext;

function operating(client: ClientRow, profile: ProfileRow): OperatingContext {
  return operatingContext(
    {
      store: (): SeededStore => opened.store,
      record: (call): void => {
        calls.push(call);
      },
      answers: (): Answers => answers,
    },
    client,
    profile,
  );
}

function edit(action: string, fields: Record<string, unknown> = {}): unknown {
  return selected(DRIVE_EDIT, action).run(context, fields, {});
}

function onlyCall(): Call {
  expect(calls).toHaveLength(1);
  const [only] = calls;
  if (only === undefined) throw new Error('no call');
  return only;
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  calls = [];
  answers = {};
  ownerProfile = opened.store.profiles.first();
  owner = opened.store.clients.create({
    name: 'Owner phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
  context = operating(owner, ownerProfile);
});

afterEach(async () => {
  await opened.close();
});

describe('Photos shared albums and partner sharing', () => {
  it('adds members, removes them and leaves out nobody silently', async () => {
    const other = randomUUID();
    answers.setPhotoAlbumMembers = (): unknown => [{ profileId: PROFILE }];
    const answer = await edit('album_members', {
      albumId: ALBUM,
      members: [
        { profileId: PROFILE, role: 'contributor' },
        { profileId: other, role: 'none' },
      ],
    });
    expect(answer).toEqual({ members: [{ profileId: PROFILE }], removed: [other] });
    expect(calls.map((call) => [call.name, call.params, call.body])).toEqual([
      [
        'setPhotoAlbumMembers',
        { albumId: ALBUM },
        { members: [{ profileId: PROFILE, role: 'contributor' }] },
      ],
      ['removePhotoAlbumMember', { albumId: ALBUM, profileId: other }, undefined],
    ]);
  });

  it('only removes when every member is none', async () => {
    await edit('album_members', {
      albumId: ALBUM,
      members: [{ profileId: PROFILE, role: 'none' }],
    });
    expect(calls.map((call) => call.name)).toEqual(['removePhotoAlbumMember']);
  });

  it('joins, leaves, comments, likes and deletes its own activity', async () => {
    await edit('album_join', { albumId: ALBUM });
    await edit('album_leave', { albumId: ALBUM });
    await edit('album_comment', { albumId: ALBUM, body: 'Lovely', itemId: ITEM });
    await edit('album_like', { albumId: ALBUM });
    await edit('album_activity_delete', { albumId: ALBUM, activityId: ACTIVITY });
    expect(calls.map((call) => [call.name, call.params, call.body])).toEqual([
      ['joinPhotoAlbum', { albumId: ALBUM }, undefined],
      ['leavePhotoAlbum', { albumId: ALBUM }, undefined],
      [
        'addPhotoAlbumActivity',
        { albumId: ALBUM },
        { kind: 'comment', text: 'Lovely', itemId: ITEM },
      ],
      ['addPhotoAlbumActivity', { albumId: ALBUM }, { kind: 'like' }],
      ['removePhotoAlbumActivity', { albumId: ALBUM, activityId: ACTIVITY }, undefined],
    ]);
  });

  it('offers a partner everything or chosen people, and answers an offer', async () => {
    await edit('partner_set', { recipientId: PROFILE, scope: 'all', fromDay: '2026-01-01' });
    await edit('partner_set', {
      recipientId: PROFILE,
      scope: 'people',
      groupIds: [GROUP],
      fromDay: '2026-01-01',
    });
    await edit('partner_accept', { shareId: SHARE });
    await edit('partner_stop', { shareId: SHARE });
    expect(callsOf()).toEqual([
      [
        'setPhotoPartner',
        { recipientId: PROFILE, scope: 'all', groupIds: [], fromDay: '2026-01-01' },
      ],
      [
        'setPhotoPartner',
        { recipientId: PROFILE, scope: 'people', groupIds: [GROUP], fromDay: '2026-01-01' },
      ],
      ['acceptPhotoPartner', undefined],
      ['stopPhotoPartner', undefined],
    ]);
  });

  it('saves chosen partner photos, or turns on saving every new one', async () => {
    await edit('partner_save', { shareId: SHARE, itemIds: [ITEM] });
    await edit('partner_save', { shareId: SHARE, autoSave: true });
    expect(calls.map((call) => [call.name, call.params, call.body])).toEqual([
      ['savePartnerPhotos', { shareId: SHARE }, { itemIds: [ITEM] }],
      ['setPartnerAutoSave', { shareId: SHARE }, { autoSave: true }],
    ]);
    expect(selected(DRIVE_EDIT, 'partner_save').issues({ shareId: SHARE })).not.toBeNull();
  });

  it('makes an album link through share_create with an album target', async () => {
    const shareId = randomUUID();
    answers.createShare = (): unknown => ({
      share: {
        id: shareId,
        itemId: null,
        albumId: ALBUM,
        permission: 'view',
        expiresAt: null,
        hasPassword: false,
        createdBy: ownerProfile.id,
        revokedAt: null,
        opens: 0,
        downloads: 0,
        lastOpenedAt: null,
      },
      url: 'https://home.example.com/s/album',
      public: true,
    });
    const answer = await edit('share_create', {
      share: { albumId: ALBUM, permission: 'view', expiresAt: null, password: null },
    });
    expect(onlyCall()).toMatchObject({ name: 'createShare', body: { albumId: ALBUM } });
    expect(answer).toMatchObject({ revoke: { action: 'share_revoke', shareId } });
  });
});

describe('Photos editing and organising edits', () => {
  const recipe = {
    crop: null,
    quarterTurns: 1,
    straighten: 0,
    flipHorizontal: false,
    flipVertical: false,
    light: { exposure: 10, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
    colour: { saturation: 0, warmth: 0, tint: 0 },
    filter: null,
    patches: [],
  };

  it('saves an edit as a version or a copy, reverts and erases', async () => {
    const strokes = [{ size: 0.1, points: [{ x: 0.5, y: 0.5 }] }];
    await edit('photo_edit', { itemId: ITEM, recipe, saveMode: 'copy' });
    await edit('photo_revert', { itemId: ITEM });
    await edit('photo_erase', { itemId: ITEM, strokes });
    expect(calls.map((call) => [call.name, call.params, call.body])).toEqual([
      ['savePhotoEdit', { itemId: ITEM }, { recipe, mode: 'copy' }],
      ['revertPhotoEdit', { itemId: ITEM }, undefined],
      ['erasePhotoArea', { itemId: ITEM }, { strokes }],
    ]);
    expect(
      selected(DRIVE_EDIT, 'photo_edit').issues({ itemId: ITEM, recipe, saveMode: 'cover' }),
    ).not.toBeNull();
  });

  it('trims or stabilizes a video and asks for at least one of them', async () => {
    await edit('video_edit', {
      itemId: ITEM,
      trim: { startMs: 0, endMs: 5000 },
      saveMode: 'version',
    });
    await edit('video_edit', { itemId: ITEM, stabilize: true, saveMode: 'copy' });
    expect(calls.map((call) => call.body)).toEqual([
      { trim: { startMs: 0, endMs: 5000 }, stabilize: false, mode: 'version' },
      { trim: null, stabilize: true, mode: 'copy' },
    ]);
    expect(
      selected(DRIVE_EDIT, 'video_edit').issues({ itemId: ITEM, saveMode: 'copy' }),
    ).not.toBeNull();
  });

  it('sets, shifts and clears date and place of photos', async () => {
    const takenAt = '2026-07-01T10:00:00.000Z';
    await edit('photo_meta', { itemIds: [ITEM], takenAt });
    await edit('photo_meta', { itemIds: [ITEM], shiftMinutes: -60 });
    await edit('photo_meta', {
      itemIds: [ITEM],
      latitude: 52.5,
      longitude: 13.4,
      locationLabel: 'Berlin',
    });
    await edit('photo_meta', { itemIds: [ITEM], clearLocation: true });
    expect(calls.map((call) => call.body)).toEqual([
      { itemIds: [ITEM], date: { kind: 'set', takenAt } },
      { itemIds: [ITEM], date: { kind: 'shift', minutes: -60 } },
      { itemIds: [ITEM], location: { latitude: 52.5, longitude: 13.4, label: 'Berlin' } },
      { itemIds: [ITEM], location: null },
    ]);
  });

  it('writes and clears the description of one photo', async () => {
    await edit('photo_description', { itemId: ITEM, text: 'Sunset at the harbour' });
    await edit('photo_description', { itemId: ITEM, text: null });
    expect(calls.map((call) => [call.name, call.params, call.body])).toEqual([
      ['setPhotoDescription', { itemId: ITEM }, { text: 'Sunset at the harbour' }],
      ['setPhotoDescription', { itemId: ITEM }, { text: null }],
    ]);
    expect(selected(DRIVE_EDIT, 'photo_description').issues({ itemId: ITEM })).not.toBeNull();
  });

  it.each([
    ['nothing to change', { itemIds: [ITEM] }],
    [
      'a date set and shifted',
      { itemIds: [ITEM], takenAt: '2026-07-01T10:00:00.000Z', shiftMinutes: 5 },
    ],
    ['half a place', { itemIds: [ITEM], latitude: 1 }],
    [
      'a place set and cleared',
      { itemIds: [ITEM], latitude: 1, longitude: 2, clearLocation: true },
    ],
    ['a zero shift', { itemIds: [ITEM], shiftMinutes: 0 }],
  ])('refuses %s', (_name, fields) => {
    expect(selected(DRIVE_EDIT, 'photo_meta').issues(fields)).not.toBeNull();
  });

  it('archives, unarchives and moves photos into the Locked folder', async () => {
    await edit('archive', { itemIds: [ITEM] });
    await edit('unarchive', { itemIds: [ITEM] });
    await edit('locked_move_in', { itemIds: [ITEM] });
    expect(callsOf()).toEqual([
      ['archivePhotos', { itemIds: [ITEM] }],
      ['unarchivePhotos', { itemIds: [ITEM] }],
      ['moveIntoLockedFolder', { itemIds: [ITEM] }],
    ]);
  });

  it('keeps every Photos edit on the person asking', async () => {
    const other = randomUUID();
    await expect(
      selected(DRIVE_EDIT, 'archive').run(context, { itemIds: [ITEM] }, { personId: other }),
    ).rejects.toThrow(/only for the person asking/);
  });
});
