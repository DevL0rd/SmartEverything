import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOB_ROOT, BOX, face, id, photo, photoFixture, type PhotoFixture } from './photo-fixture';

let fixture: PhotoFixture;
let first: string;
let second: string;

beforeEach(() => {
  fixture = photoFixture();
  first = photo(fixture.database, { n: 1, root: BOB_ROOT });
  second = photo(fixture.database, { n: 2, root: BOB_ROOT });
});

afterEach(() => {
  fixture.database.close();
});

describe('photo analysis', () => {
  it('saves and replaces one analysis per item', () => {
    const { photoAnalysis } = fixture.repos;
    photoAnalysis.save({
      itemId: first,
      rev: 1,
      model: 'vision-a',
      state: 'done',
      caption: 'A dog on a beach',
      scene: 'beach',
      text: null,
      labels: ['dog', 'sand'],
      pets: [{ species: 'dog', box: BOX }],
      error: null,
    });
    expect(photoAnalysis.find(first)).toEqual({
      itemId: first,
      rev: 1,
      model: 'vision-a',
      state: 'done',
      caption: 'A dog on a beach',
      scene: 'beach',
      text: null,
      labels: ['dog', 'sand'],
      pets: [{ species: 'dog', box: BOX }],
      error: null,
      analysedAt: '2026-11-14T10:00:00.000Z',
    });
    photoAnalysis.save({
      itemId: first,
      rev: 2,
      model: 'vision-b',
      state: 'failed',
      caption: null,
      scene: null,
      text: null,
      labels: [],
      pets: [],
      error: 'refused',
    });
    expect(photoAnalysis.find(first)).toMatchObject({ rev: 2, state: 'failed', error: 'refused' });
    expect(photoAnalysis.forItems([first, second]).map((row) => row.itemId)).toEqual([first]);
  });

  it('counts by state and removes one or all', () => {
    const { photoAnalysis } = fixture.repos;
    const base = {
      rev: 1,
      model: 'm',
      caption: null,
      scene: null,
      text: null,
      labels: [],
      pets: [],
      error: null,
    } as const;
    photoAnalysis.save({ ...base, itemId: first, state: 'needs_key' });
    photoAnalysis.save({ ...base, itemId: second, state: 'skipped' });
    expect(photoAnalysis.countsByState()).toEqual({
      done: 0,
      failed: 0,
      needs_key: 1,
      skipped: 1,
    });
    photoAnalysis.remove(first);
    expect(photoAnalysis.find(first)).toBeUndefined();
    expect(photoAnalysis.removeAll()).toBe(1);
  });

  it('refuses a failed analysis without an error', () => {
    expect(() => {
      fixture.repos.photoAnalysis.save({
        itemId: first,
        rev: 1,
        model: 'm',
        state: 'failed',
        caption: null,
        scene: null,
        text: null,
        labels: [],
        pets: [],
        error: null,
      });
    }).toThrow(/constraint/);
  });
});

describe('photo embeddings', () => {
  it('round trips a vector and replaces it', () => {
    const { photoEmbeddings } = fixture.repos;
    photoEmbeddings.save({
      itemId: first,
      rev: 1,
      model: 'embed-a',
      dims: 4,
      scale: 0.5,
      vector: new Uint8Array([1, 2, 3, 4]),
    });
    expect(photoEmbeddings.find(first)?.vector).toEqual(new Uint8Array([1, 2, 3, 4]));
    photoEmbeddings.save({
      itemId: first,
      rev: 2,
      model: 'embed-b',
      dims: 2,
      scale: 1,
      vector: new Uint8Array([9, 9]),
    });
    expect(photoEmbeddings.forItems([first, second])).toEqual([
      {
        itemId: first,
        rev: 2,
        model: 'embed-b',
        dims: 2,
        scale: 1,
        vector: new Uint8Array([9, 9]),
      },
    ]);
    photoEmbeddings.remove(first);
    expect(photoEmbeddings.find(first)).toBeUndefined();
    expect(photoEmbeddings.removeAll()).toBe(0);
  });

  it('is removed with the item', () => {
    fixture.repos.photoEmbeddings.save({
      itemId: first,
      rev: 1,
      model: 'm',
      dims: 1,
      scale: 1,
      vector: new Uint8Array([1]),
    });
    fixture.database.prepare('delete from drive_items where id = ?').run(first);
    expect(fixture.repos.photoEmbeddings.find(first)).toBeUndefined();
  });
});

describe('photo faces', () => {
  it('stores detections, replaces them per item and parses boxes', () => {
    const { photoFaces } = fixture.repos;
    const one = face(fixture, first, 1);
    const pet = face(fixture, first, 2, 'pet');
    expect(photoFaces.forItem(first).map((row) => row.id)).toEqual([one, pet]);
    expect(photoFaces.byId(pet)).toMatchObject({ kind: 'pet', species: 'dog', box: BOX });
    expect(photoFaces.forItems([first, second])).toHaveLength(2);
    photoFaces.replaceForItem(first, []);
    expect(photoFaces.forItem(first)).toEqual([]);
  });

  it('removes one kind and the faces of items', () => {
    const { photoFaces } = fixture.repos;
    face(fixture, first, 1);
    face(fixture, second, 2, 'pet');
    expect(photoFaces.removeKind('pet')).toBe(1);
    expect(photoFaces.removeForItems([first])).toBe(1);
    expect(photoFaces.find(id('0f', 1))).toBeUndefined();
  });

  it('refuses a pet without a species and a face with one', () => {
    expect(() =>
      fixture.database
        .prepare(
          `insert into photo_faces (id, item_id, rev, kind, species, box, landmarks, score, quality, model, vector)
          values (?, ?, 1, 'person', 'dog', '{}', null, 0.5, 0.5, 'm', x'01')`,
        )
        .run(id('0f', 9), first),
    ).toThrow(/constraint/);
  });
});
