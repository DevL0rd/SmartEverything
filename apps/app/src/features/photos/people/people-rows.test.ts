import type { PhotoGroup, PhotoPeople } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  groupColumnsOf,
  mergeColumnsOf,
  peopleRowsOf,
  samePeopleRow,
  tileWidthOf,
  type PeopleLayout,
} from './people-rows';

function group(id: string, count: number, extra: Partial<PhotoGroup> = {}): PhotoGroup {
  return {
    id,
    kind: 'person',
    name: count > 1 ? id : null,
    species: null,
    linkedProfileId: null,
    coverFaceId: `${id}-face`,
    coverItemId: `${id}-item`,
    coverBox: { x: 0, y: 0, w: 0.5, h: 0.5 },
    hidden: false,
    count,
    updatedAt: '2026-11-21T10:00:00.000Z',
    ...extra,
  };
}

const LAYOUT: PeopleLayout = { width: 600, size: 112, live: true, species: null };

const PEOPLE: PhotoPeople = {
  groups: [
    ...Array.from({ length: 11 }, (_, index) => group(`p${String(index)}`, 5)),
    group('u1', 1),
    group('cat', 3, { kind: 'pet', species: 'cat', name: 'Tom' }),
    group('dog', 3, { kind: 'pet', species: 'dog', name: 'Rex' }),
    group('h1', 4, { hidden: true }),
  ],
  mergeSuggestions: [
    { groupIds: ['p0', 'p1'], similarity: 0.9 },
    { groupIds: ['p2', 'p3'], similarity: 0.9 },
    { groupIds: ['p4', 'p5'], similarity: 0.9 },
  ],
};

describe('people rows', () => {
  it('fits columns to the measured width', () => {
    expect(groupColumnsOf(616, 112)).toBe(4);
    expect(tileWidthOf(600, 112)).toBe(154);
    expect(mergeColumnsOf(600)).toBe(2);
    expect(mergeColumnsOf(100)).toBe(1);
  });

  it('lays every suggestion and group out in rows with no cap', () => {
    const rows = peopleRowsOf(PEOPLE, LAYOUT);
    expect(rows.map((row) => row.kind)).toEqual([
      'merge',
      'merge',
      'title',
      'tiles',
      'tiles',
      'tiles',
      'title',
      'species',
      'tiles',
      'title',
      'tiles',
      'title',
      'tiles',
    ]);
    const tiles = rows.flatMap((row) => (row.kind === 'tiles' ? row.groups : []));
    expect(tiles).toHaveLength(PEOPLE.groups.length);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it('leaves merge rows out while offline and filters pets by species', () => {
    const rows = peopleRowsOf(PEOPLE, { ...LAYOUT, live: false, species: 'cat' });
    expect(rows.some((row) => row.kind === 'merge')).toBe(false);
    const pets = rows.find((row) => row.kind === 'tiles' && row.key.startsWith('pets:'));
    expect(pets?.kind === 'tiles' ? pets.groups.map((pet) => pet.id) : []).toEqual(['cat']);
  });

  it('keeps rows equal when the same data is laid out again', () => {
    const first = peopleRowsOf(PEOPLE, LAYOUT);
    const second = peopleRowsOf(PEOPLE, LAYOUT);
    expect(first.every((row, index) => samePeopleRow(row, second[index] ?? row))).toBe(true);
    expect(second).toHaveLength(first.length);
  });
});
