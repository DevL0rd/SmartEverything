import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MetaEditor } from '../../../src/photos/organise/meta';
import { DriveAlbumsRepository } from '../../../src/store/repositories/drive-albums';
import { openKit, type Kit } from './fixture';

let kit: Kit;
let editor: MetaEditor;

beforeEach(async () => {
  kit = await openKit();
  editor = new MetaEditor(kit.store);
});
afterEach(async () => {
  await kit.test.close();
});

describe('date and location edits', () => {
  it('sets a date with its own offset, keeps it as an override and names the source', () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', offset: 0 });
    const result = editor.edit(kit.alice, {
      itemIds: [id],
      date: { kind: 'set', takenAt: '2026-04-02T08:30:00+07:00' },
    });
    expect(result).toEqual({ count: 1 });
    expect(kit.row(id)).toMatchObject({
      taken_at: '2026-04-02T01:30:00.000Z',
      tz_offset_min: 420,
      time_source: 'manual',
    });
    expect(kit.store.photoMetaOverrides.find(id)).toMatchObject({
      takenAt: '2026-04-02T01:30:00.000Z',
      tzOffsetMin: 420,
      setBy: kit.alice.profileId,
    });
    expect(kit.notices).toMatchObject([{ type: 'drive_changed', months: ['2026-03', '2026-04'] }]);
  });

  it('shifts dates by an offset, keeps the offset and crosses month ends', () => {
    const first = kit.seed({ n: 1, takenAt: '2026-03-31T23:30:00.000Z', offset: 120 });
    const second = kit.seed({ n: 2, takenAt: '2026-03-10T10:00:00.000Z' });
    editor.edit(kit.alice, { itemIds: [first, second], date: { kind: 'shift', minutes: 90 } });
    expect(kit.row(first)).toMatchObject({
      taken_at: '2026-04-01T01:00:00.000Z',
      tz_offset_min: 120,
    });
    expect(kit.row(second)).toMatchObject({
      taken_at: '2026-03-10T11:30:00.000Z',
      tz_offset_min: null,
    });
    editor.edit(kit.alice, { itemIds: [first], date: { kind: 'shift', minutes: -24 * 60 } });
    expect(kit.row(first)['taken_at']).toBe('2026-03-31T01:00:00.000Z');
    expect(kit.store.photoMetaOverrides.find(first)?.takenAt).toBe('2026-03-31T01:00:00.000Z');
  });

  it('refuses a shift past the dates a photo can have', () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    expect(() =>
      editor.edit(kit.alice, { itemIds: [id], date: { kind: 'shift', minutes: 1e12 } }),
    ).toThrow(expect.objectContaining({ code: 'invalid_request' }));
    expect(kit.row(id)['taken_at']).toBe('2026-03-01T10:00:00.000Z');
  });

  it('sets and clears a location, finding the place again afterwards', () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', placeId: '1001' });
    editor.edit(kit.alice, {
      itemIds: [id],
      location: { latitude: 41.1, longitude: -8.6, label: 'Porto trip' },
    });
    expect(kit.row(id)).toMatchObject({ place_lat: 41.1, place_lon: -8.6, place_id: null });
    expect(kit.store.photoMetaOverrides.find(id)).toMatchObject({
      latitude: 41.1,
      longitude: -8.6,
      placeLabel: 'Porto trip',
      takenAt: null,
    });
    editor.edit(kit.alice, { itemIds: [id], location: null });
    expect(kit.row(id)).toMatchObject({ place_lat: null, place_lon: null });
    expect(kit.store.photoMetaOverrides.find(id)).toMatchObject({
      latitude: null,
      locationCleared: true,
    });
  });

  it('keeps the date override when only the location is cleared', () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    editor.edit(kit.alice, {
      itemIds: [id],
      date: { kind: 'set', takenAt: '2026-05-01T00:00:00Z' },
      location: { latitude: 1, longitude: 2, label: null },
    });
    editor.edit(kit.alice, { itemIds: [id], location: null });
    expect(kit.store.photoMetaOverrides.find(id)).toMatchObject({
      takenAt: '2026-05-01T00:00:00.000Z',
      latitude: null,
      placeLabel: null,
      locationCleared: true,
    });
  });

  it('changes nothing when one of the photos is not visible to the caller', () => {
    const mine = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    const theirs = kit.seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z', root: kit.bobRoot });
    expect(() =>
      editor.edit(kit.alice, { itemIds: [mine, theirs], date: { kind: 'shift', minutes: 60 } }),
    ).toThrow(expect.objectContaining({ code: 'not_found' }));
    expect(kit.row(mine)['taken_at']).toBe('2026-03-01T10:00:00.000Z');
    expect(kit.notices).toEqual([]);
  });

  it('refuses photos that reach the caller only through someone else drive', () => {
    const shared = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', root: kit.bobRoot });
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
    albums.addItems(created.id, [shared]);
    kit.store.photoAlbumMembers.invite(
      created.id,
      kit.alice.profileId,
      'viewer',
      kit.bob.profileId,
    );
    expect(() =>
      editor.edit(kit.alice, { itemIds: [shared], date: { kind: 'shift', minutes: 5 } }),
    ).toThrow(expect.objectContaining({ code: 'forbidden' }));
  });
});
