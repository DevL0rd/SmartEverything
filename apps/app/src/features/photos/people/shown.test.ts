import type { PhotoGroup, PhotoPeople } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { facesWithout, lessFaces, mergedPeople, updatedGroup, withoutSuggestion } from './shown';

function group(id: string, count: number): PhotoGroup {
  return {
    id,
    kind: 'person',
    name: null,
    species: null,
    linkedProfileId: null,
    coverFaceId: `${id}-face`,
    coverItemId: `${id}-item`,
    coverBox: { x: 0, y: 0, w: 0.5, h: 0.5 },
    hidden: false,
    count,
    updatedAt: '2026-11-21T10:00:00.000Z',
  };
}

const PEOPLE: PhotoPeople = {
  groups: [group('a', 4), group('b', 2), group('c', 1)],
  mergeSuggestions: [
    { groupIds: ['a', 'b'], similarity: 0.9 },
    { groupIds: ['b', 'c'], similarity: 0.8 },
  ],
};

describe('people shown at once', () => {
  it('renames and hides a group without touching the rest', () => {
    const next = updatedGroup(group('a', 4), { name: 'Sam', hidden: true });
    expect(next).toMatchObject({ name: 'Sam', hidden: true, linkedProfileId: null });
  });

  it('merges the sources into the target count and drops their suggestions', () => {
    const merged = mergedPeople(PEOPLE, 'a', new Set(['b']));
    expect(merged.groups.map((each) => [each.id, each.count])).toEqual([
      ['a', 6],
      ['c', 1],
    ]);
    expect(merged.mergeSuggestions).toEqual([]);
  });

  it('removes a dismissed suggestion only', () => {
    expect(withoutSuggestion(PEOPLE, ['b', 'a']).mergeSuggestions).toEqual([
      { groupIds: ['b', 'c'], similarity: 0.8 },
    ]);
  });

  it('drops a group whose last faces are removed', () => {
    expect(lessFaces(group('a', 4), 1)?.count).toBe(3);
    expect(lessFaces(group('a', 1), 1)).toBeNull();
  });

  it('takes removed faces out of their group in a photo', () => {
    const item = {
      itemId: 'p1',
      faces: [
        {
          id: 'f1',
          kind: 'person' as const,
          species: null,
          box: { x: 0, y: 0, w: 0.2, h: 0.2 },
          groupId: 'a',
          groupName: 'Sam',
        },
      ],
    };
    expect(facesWithout(item, new Set(['f1'])).faces[0]).toMatchObject({
      groupId: null,
      groupName: null,
    });
    expect(facesWithout(item, new Set(['f2']))).toBe(item);
  });
});
