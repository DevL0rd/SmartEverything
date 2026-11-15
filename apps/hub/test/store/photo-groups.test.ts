import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PhotoGroupMergeError,
  type PhotoGroupRow,
} from '../../src/store/repositories/photo-groups';
import { BOB_ROOT, face, id, photo, photoFixture, type PhotoFixture } from './photo-fixture';

let fixture: PhotoFixture;
let faces: string[];
let item: string;

const person = (n: number, profileId: string, coverFaceId: string | null = null): PhotoGroupRow =>
  fixture.repos.photoGroups.insert({
    id: id('0e', n),
    profileId,
    kind: 'person',
    species: null,
    name: null,
    coverFaceId,
  });

beforeEach(() => {
  fixture = photoFixture();
  item = photo(fixture.database, { n: 1, root: BOB_ROOT });
  faces = [1, 2, 3].map((n) => face(fixture, item, n));
});

afterEach(() => {
  fixture.database.close();
});

describe('photo groups', () => {
  it('lists groups per viewer and kind and keeps names private to the viewer', () => {
    const mine = person(1, fixture.alice, faces[0] ?? null);
    person(2, fixture.bob);
    fixture.repos.photoGroups.insert({
      id: id('0e', 3),
      profileId: fixture.alice,
      kind: 'pet',
      species: 'dog',
      name: 'Rex',
      coverFaceId: null,
    });
    const groups = fixture.repos.photoGroups;
    expect(groups.forProfile(fixture.alice).map((group) => group.id)).toEqual([
      mine.id,
      id('0e', 3),
    ]);
    expect(groups.forProfile(fixture.alice, 'pet').map((group) => group.name)).toEqual(['Rex']);
    expect(groups.forProfile(fixture.cara)).toEqual([]);
    expect(
      groups.update(mine.id, { name: 'Mum', hidden: true, linkedProfileId: fixture.bob }),
    ).toMatchObject({ name: 'Mum', hidden: true, linkedProfileId: fixture.bob });
    expect(groups.forProfile(fixture.bob)[0]?.name).toBeNull();
  });

  it('refuses a pet group without a species and a link on a pet group', () => {
    expect(() =>
      fixture.repos.photoGroups.insert({
        id: id('0e', 1),
        profileId: fixture.alice,
        kind: 'pet',
        species: null,
        name: null,
        coverFaceId: null,
      }),
    ).toThrow(/constraint/);
    const pet = fixture.repos.photoGroups.insert({
      id: id('0e', 2),
      profileId: fixture.alice,
      kind: 'pet',
      species: 'cat',
      name: null,
      coverFaceId: null,
    });
    expect(() =>
      fixture.repos.photoGroups.update(pet.id, { linkedProfileId: fixture.bob }),
    ).toThrow(/constraint/);
  });

  it('puts a face in one group per viewer and moves it when assigned again', () => {
    const groups = fixture.repos.photoGroups;
    const one = person(1, fixture.alice);
    const two = person(2, fixture.alice);
    groups.assign(one.id, [faces[0] ?? '', faces[1] ?? ''], 'auto');
    groups.assign(two.id, [faces[1] ?? ''], 'confirmed');
    expect(groups.faceIds(one.id)).toEqual([faces[0]]);
    expect(groups.faceIds(two.id)).toEqual([faces[1]]);
    expect(groups.groupOfFace(fixture.alice, faces[1] ?? '')?.id).toBe(two.id);
    expect(groups.membershipsOf(fixture.alice, faces)).toEqual([
      { groupId: one.id, faceId: faces[0], profileId: fixture.alice, source: 'auto' },
      { groupId: two.id, faceId: faces[1], profileId: fixture.alice, source: 'confirmed' },
    ]);
    expect(groups.unassignedFaceIds(fixture.alice, [item])).toEqual([faces[2]]);
    expect(groups.unassignedFaceIds(fixture.bob, [item])).toEqual(faces);
  });

  it('remembers Not this person and lets another group take the face', () => {
    const groups = fixture.repos.photoGroups;
    const one = person(1, fixture.alice);
    const two = person(2, fixture.alice);
    groups.assign(one.id, [faces[0] ?? ''], 'auto');
    groups.reject(one.id, [faces[0] ?? '']);
    expect(groups.faceIds(one.id)).toEqual([]);
    expect(groups.rejectedGroups(fixture.alice, faces[0] ?? '')).toEqual([one.id]);
    expect(groups.groupOfFace(fixture.alice, faces[0] ?? '')).toBeUndefined();
    groups.assign(two.id, [faces[0] ?? ''], 'confirmed');
    expect(groups.groupOfFace(fixture.alice, faces[0] ?? '')?.id).toBe(two.id);
    expect(groups.rejectedGroups(fixture.alice, faces[0] ?? '')).toEqual([one.id]);
  });

  it('merges groups, moving faces and clearing target rejections', () => {
    const groups = fixture.repos.photoGroups;
    const target = person(1, fixture.alice);
    const source = person(2, fixture.alice);
    groups.assign(source.id, [faces[0] ?? '', faces[1] ?? ''], 'auto');
    groups.reject(target.id, [faces[1] ?? '']);
    groups.assign(target.id, [faces[2] ?? ''], 'confirmed');
    const merged = groups.merge(target.id, [source.id]);
    expect(merged.id).toBe(target.id);
    expect(groups.find(source.id)).toBeUndefined();
    expect(groups.faceIds(target.id)).toEqual([...faces].sort());
    expect(groups.rejectedGroups(fixture.alice, faces[1] ?? '')).toEqual([]);
  });

  it('refuses to merge across viewers or kinds', () => {
    const groups = fixture.repos.photoGroups;
    const mine = person(1, fixture.alice);
    const theirs = person(2, fixture.bob);
    expect(() => groups.merge(mine.id, [theirs.id])).toThrow(PhotoGroupMergeError);
    expect(groups.find(theirs.id)).toBeDefined();
  });

  it('forgets a group without touching the detections and drops faces with their item', () => {
    const groups = fixture.repos.photoGroups;
    const one = person(1, fixture.alice, faces[0] ?? null);
    groups.assign(one.id, faces, 'auto');
    groups.remove(one.id);
    expect(fixture.repos.photoFaces.forItem(item)).toHaveLength(3);
    const two = person(2, fixture.alice, faces[0] ?? null);
    groups.assign(two.id, faces, 'auto');
    fixture.repos.photoFaces.removeForItems([item]);
    expect(groups.faceIds(two.id)).toEqual([]);
    expect(groups.byId(two.id).coverFaceId).toBeNull();
    expect(groups.removeForProfile(fixture.alice, 'person')).toBe(1);
  });
});
