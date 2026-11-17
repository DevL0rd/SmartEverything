import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveReadService } from '../../../src/drive/service-read';
import { PhotoMedia } from '../../../src/photos/media-routes';
import { DescriptionEditor } from '../../../src/photos/organise/description';
import { DriveAlbumsRepository } from '../../../src/store/repositories/drive-albums';
import { openKit, type Kit } from './fixture';

let kit: Kit;
let editor: DescriptionEditor;

beforeEach(async () => {
  kit = await openKit();
  editor = new DescriptionEditor(kit.store);
});
afterEach(async () => {
  await kit.test.close();
});

function shownDescription(itemId: string): unknown {
  return new PhotoMedia(kit.store.context, new DriveReadService(kit.store), kit.store).info(
    kit.alice,
    itemId,
  ).description;
}

describe('description edits', () => {
  it('writes a description by hand over the one from the file and tells the app', () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    kit.store.photoDescriptions.fromFile(id, 'From the camera');
    expect(shownDescription(id)).toEqual({ text: 'From the camera', source: 'file' });
    expect(editor.set(kit.alice, id, { text: 'Our first boat trip' })).toEqual({ count: 1 });
    expect(shownDescription(id)).toEqual({ text: 'Our first boat trip', source: 'manual' });
    expect(kit.notices).toMatchObject([{ type: 'drive_changed', months: ['2026-03'] }]);
    kit.store.photoDescriptions.fromFile(id, 'Read again');
    expect(shownDescription(id)).toEqual({ text: 'Our first boat trip', source: 'manual' });
  });

  it('clears a description and keeps it cleared when the file is read again', () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    kit.store.photoDescriptions.fromFile(id, 'From the camera');
    editor.set(kit.alice, id, { text: null });
    expect(shownDescription(id)).toBeNull();
    kit.store.photoDescriptions.fromFile(id, 'From the camera');
    expect(shownDescription(id)).toBeNull();
  });

  it('refuses photos the caller cannot see or reaches only through someone else drive', () => {
    const theirs = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', root: kit.bobRoot });
    expect(() => editor.set(kit.alice, theirs, { text: 'Mine now' })).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    const albums = new DriveAlbumsRepository(kit.store.context);
    const created = albums.insert({
      id: randomUUID(),
      title: 'Trip',
      kind: 'manual',
      surface: 'photos',
      scope: 'person',
      ownerProfileId: kit.bob.profileId,
      coverItemId: null,
    });
    albums.addItems(created.id, [theirs]);
    kit.store.photoAlbumMembers.invite(
      created.id,
      kit.alice.profileId,
      'viewer',
      kit.bob.profileId,
    );
    expect(() => editor.set(kit.alice, theirs, { text: 'Mine now' })).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(kit.store.photoDescriptions.find(theirs)).toBeUndefined();
  });
});
