import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BOB_ROOT,
  context,
  addFace,
  alice,
  bob,
  consent,
  direction,
  groups,
  people,
  resetConsent,
  seed,
  setup,
  teardown,
} from './fixture';

beforeEach(() => {
  setup();
  resetConsent();
});

afterEach(teardown);

function photos(count: number, root?: string): string[] {
  return Array.from({ length: count }, (_, index) =>
    seed({
      n: index + 1 + (root === undefined ? 0 : 100),
      takenAt: `2026-03-0${String(index + 1)}T10:00:00.000Z`,
      ...(root === undefined ? {} : { root }),
    }),
  );
}

describe('grouping faces for each viewer', () => {
  it('puts look-alike faces in one group and unlike faces in another, singles last', async () => {
    const [a1, a2, b1, c1] = photos(4);
    addFace({ itemId: a1 ?? '', embedding: direction(0) });
    addFace({ itemId: a2 ?? '', embedding: direction(0, 0.1) });
    addFace({ itemId: b1 ?? '', embedding: direction(5) });
    addFace({ itemId: c1 ?? '', embedding: direction(9) });
    const service = people();
    expect(await service.regroup(alice.profileId, 'person')).toBe(3);
    const view = service.people(alice);
    expect(view.groups.map((group) => group.count)).toEqual([2, 1, 1]);
    expect(view.groups.every((group) => group.kind === 'person' && group.name === null)).toBe(true);
  });

  it('keeps each viewer in their own groups and names private to them', async () => {
    const [a1] = photos(1);
    addFace({ itemId: a1 ?? '', embedding: direction(0) });
    const service = people();
    await service.regroup(alice.profileId, 'person');
    await service.regroup(bob.profileId, 'person');
    const [mine] = service.people(alice).groups;
    const [theirs] = service.people(bob).groups;
    expect(mine?.id).not.toBe(theirs?.id);
    service.update(alice, mine?.id ?? '', { name: 'Mum' });
    expect(service.people(bob).groups[0]?.name).toBeNull();
    expect(() => service.group(bob, mine?.id ?? '')).toThrow('no such person');
    expect(() => service.update(bob, mine?.id ?? '', { name: 'X' })).toThrow('no such person');
  });

  it('never shows groups or faces of photos the viewer cannot open', async () => {
    const [own] = photos(1);
    const [theirs] = photos(1, BOB_ROOT);
    addFace({ itemId: own ?? '', embedding: direction(0) });
    const secret = addFace({ itemId: theirs ?? '', embedding: direction(0, 0.05) });
    const service = people();
    await service.regroup(alice.profileId, 'person');
    await service.regroup(bob.profileId, 'person');
    expect(service.people(alice).groups.map((group) => group.count)).toEqual([1]);
    expect(service.people(bob).groups.map((group) => group.count)).toEqual([2]);
    expect(() => service.itemFaces(alice, theirs ?? '')).toThrow('not in your Photos');
    expect(service.itemFaces(bob, theirs ?? '').faces.map((face) => face.id)).toEqual([secret]);
    expect(groups().membershipsOf(alice.profileId, [secret])).toEqual([]);
  });

  it('stops grouping for a person who turned face grouping off', async () => {
    const [a1] = photos(1);
    addFace({ itemId: a1 ?? '', embedding: direction(0) });
    consent.face.set(alice.profileId, false);
    const service = people();
    expect(await service.regroup(alice.profileId, 'person')).toBe(0);
    expect(service.people(alice).groups).toEqual([]);
  });

  it('keeps named groups pinned and sends new look-alike faces to them', async () => {
    const [a1, a2] = photos(2);
    addFace({ itemId: a1 ?? '', embedding: direction(0) });
    const service = people();
    await service.regroup(alice.profileId, 'person');
    const [group] = service.people(alice).groups;
    service.update(alice, group?.id ?? '', { name: 'Dad' });
    addFace({ itemId: a2 ?? '', embedding: direction(0, 0.1) });
    await service.regroup(alice.profileId, 'person');
    const [after] = service.people(alice).groups;
    expect(service.people(alice).groups).toHaveLength(1);
    expect(after).toMatchObject({ id: group?.id, name: 'Dad', count: 2 });
    expect(
      groups()
        .membershipsOf(alice.profileId, [group?.coverFaceId ?? ''])
        .at(0)?.source,
    ).toBe('confirmed');
  });

  it('keeps a rejected face out of the group after reclustering', async () => {
    const [a1, a2] = photos(2);
    addFace({ itemId: a1 ?? '', embedding: direction(0) });
    const stray = addFace({ itemId: a2 ?? '', embedding: direction(0, 0.1) });
    const service = people();
    await service.regroup(alice.profileId, 'person');
    const [group] = service.people(alice).groups;
    const left = await service.removeFaces(alice, group?.id ?? '', { faceIds: [stray] });
    expect(left?.count).toBe(1);
    await service.regroup(alice.profileId, 'person');
    const after = service.people(alice).groups;
    expect(after.map((entry) => entry.count)).toEqual([1, 1]);
    expect(groups().rejectedGroups(alice.profileId, stray)).toEqual([group?.id]);
    expect(groups().groupOfFace(alice.profileId, stray)?.id).not.toBe(group?.id);
  });

  it('refuses to remove a face that is not in the group', async () => {
    const [a1, a2] = photos(2);
    addFace({ itemId: a1 ?? '', embedding: direction(0) });
    const other = addFace({ itemId: a2 ?? '', embedding: direction(7) });
    const service = people();
    await service.regroup(alice.profileId, 'person');
    const home = groups().groupOfFace(alice.profileId, other);
    const target = service.people(alice).groups.find((entry) => entry.id !== home?.id);
    await expect(
      service.removeFaces(alice, target?.id ?? '', { faceIds: [other] }),
    ).rejects.toThrow();
  });

  it('merges groups into one confirmed group and refuses unlike kinds', async () => {
    const [a1, a2, a3] = photos(3);
    addFace({ itemId: a1 ?? '', embedding: direction(0) });
    addFace({ itemId: a2 ?? '', embedding: direction(6) });
    addFace({ itemId: a3 ?? '', embedding: direction(3), kind: 'pet', species: 'dog' });
    const service = people();
    await service.regroup(alice.profileId, 'person');
    await service.regroup(alice.profileId, 'pet');
    const persons = service.people(alice, 'person').groups;
    const pet = service.people(alice, 'pet').groups[0];
    const [first, second] = persons;
    expect(() =>
      service.merge(alice, { targetId: first?.id ?? '', sourceIds: [pet?.id ?? ''] }),
    ).toThrow('same kind');
    const merged = service.merge(alice, {
      targetId: first?.id ?? '',
      sourceIds: [second?.id ?? ''],
    });
    expect(merged.count).toBe(2);
    expect(service.people(alice, 'person').groups).toHaveLength(1);
  });

  it('suggests merging groups that look like one person but were kept apart', async () => {
    const [a1, a2] = photos(2);
    const first = addFace({ itemId: a1 ?? '', embedding: direction(0) });
    addFace({ itemId: a2 ?? '', embedding: direction(0, 0.2) });
    const service = people();
    await service.regroup(alice.profileId, 'person');
    const [group] = service.people(alice).groups;
    await service.removeFaces(alice, group?.id ?? '', { faceIds: [first] });
    const view = service.people(alice);
    expect(view.groups).toHaveLength(2);
    expect(view.mergeSuggestions).toHaveLength(1);
    expect(view.mergeSuggestions[0]?.similarity).toBeGreaterThan(0.9);
  });

  it('stops suggesting a merge once the caller dismissed it, for them only', async () => {
    const [a1, a2] = photos(2);
    const first = addFace({ itemId: a1 ?? '', embedding: direction(0) });
    addFace({ itemId: a2 ?? '', embedding: direction(0, 0.2) });
    const service = people();
    await service.regroup(alice.profileId, 'person');
    const [group] = service.people(alice).groups;
    await service.removeFaces(alice, group?.id ?? '', { faceIds: [first] });
    const [suggestion] = service.people(alice).mergeSuggestions;
    const [left, right] = suggestion?.groupIds ?? ['', ''];
    expect(() => {
      service.dismissMerge(bob, { groupIds: [left, right] });
    }).toThrow(expect.objectContaining({ code: 'not_found' }));
    service.dismissMerge(alice, { groupIds: [right, left] });
    service.dismissMerge(alice, { groupIds: [left, right] });
    expect(service.people(alice).mergeSuggestions).toEqual([]);
    expect(service.people(alice).groups).toHaveLength(2);
  });

  it('links a person to a household member and hides a group', async () => {
    const [a1] = photos(1);
    addFace({ itemId: a1 ?? '', embedding: direction(0) });
    const service = people();
    await service.regroup(alice.profileId, 'person');
    const [group] = service.people(alice).groups;
    const linked = service.update(alice, group?.id ?? '', {
      linkedProfileId: bob.profileId,
      hidden: true,
    });
    expect(linked).toMatchObject({ linkedProfileId: bob.profileId, hidden: true });
    expect(() =>
      service.update(alice, group?.id ?? '', {
        linkedProfileId: '0f000000-0000-4000-8000-0000000000ff',
      }),
    ).toThrow('household member');
  });

  it('groups pets within their species and never mixes models', async () => {
    const [a1, a2, a3] = photos(3);
    addFace({ itemId: a1 ?? '', embedding: direction(1), kind: 'pet', species: 'dog' });
    addFace({ itemId: a2 ?? '', embedding: direction(1, 0.05), kind: 'pet', species: 'cat' });
    addFace({ itemId: a3 ?? '', embedding: direction(1), kind: 'pet', species: 'dog' });
    const service = people();
    await service.regroup(alice.profileId, 'pet');
    const pets = service.people(alice, 'pet').groups;
    expect(pets.map((pet) => [pet.species, pet.count]).sort()).toEqual([
      ['cat', 1],
      ['dog', 2],
    ]);
    expect(service.people(alice, 'person').groups).toEqual([]);
  });

  it('removes unnamed groups whose photos are gone', async () => {
    const [a1, a2] = photos(2);
    addFace({ itemId: a1 ?? '', embedding: direction(0) });
    addFace({ itemId: a2 ?? '', embedding: direction(8) });
    const service = people();
    await service.regroup(alice.profileId, 'person');
    expect(service.people(alice).groups).toHaveLength(2);
    context.sql.run('drop the photo', 'delete from drive_items where id = $id', { id: a2 ?? '' });
    await service.regroup(alice.profileId, 'person');
    expect(groups().forProfile(alice.profileId)).toHaveLength(1);
  });
});
