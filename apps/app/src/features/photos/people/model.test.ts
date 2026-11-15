import type {
  PhotoAiStatus,
  PhotoGroup,
  PhotoMergeSuggestion,
  PhotoPeople,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  compareGroups,
  emptyReasonOf,
  faceCropOf,
  faceScanTextOf,
  groupingTextOf,
  groupingProgressOf,
  faceProgressOf,
  groupLabelOf,
  groupCaptionOf,
  groupTitleOf,
  mergeCandidatesOf,
  mergeSubtitleOf,
  mergeTargetsOf,
  nameDraftOf,
  pairLineOf,
  peopleSectionsOf,
  peopleStateOf,
  peopleSubtitleOf,
  namingLineOf,
  namingOf,
  speciesChipsOf,
  suggestionKey,
} from './model';

let next = 0;

function group(patch: Partial<PhotoGroup> = {}): PhotoGroup {
  next += 1;
  const id = `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
  return {
    id,
    kind: 'person',
    name: null,
    species: null,
    linkedProfileId: null,
    coverFaceId: id,
    coverItemId: id,
    coverBox: { x: 0.4, y: 0.2, w: 0.2, h: 0.2 },
    hidden: false,
    count: 3,
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...patch,
  };
}

const PROGRESS = { done: 0, queued: 0, failed: 0, needsKey: 0 };

function status(patch: Partial<PhotoAiStatus> = {}): PhotoAiStatus {
  return {
    smartSearch: true,
    faceGrouping: true,
    hasKey: true,
    total: 10,
    faces: PROGRESS,
    tags: PROGRESS,
    index: PROGRESS,
    people: { faces: 0, grouped: 0 },
    spentMicros: 0,
    estimateMicros: 0,
    models: { vision: 'v', embedding: 'e', petEmbedding: 'p', eraser: 'x' },
    ...patch,
  };
}

describe('the people page sections', () => {
  const anna = group({ name: 'Anna', count: 4 });
  const bo = group({ name: 'Bo', count: 40 });
  const big = group({ count: 90 });
  const once = group({ count: 1 });
  const rex = group({ kind: 'pet', species: 'dog', name: 'Rex', count: 8 });
  const tom = group({ kind: 'pet', species: 'cat', count: 5 });
  const stray = group({ kind: 'pet', species: 'cat', count: 1 });
  const hidden = group({ name: 'Old friend', hidden: true });
  const all = [anna, bo, big, once, rex, tom, stray, hidden];

  it('puts named groups first, then the largest, and keeps one-face groups unsorted', () => {
    const sections = peopleSectionsOf(all, null);
    expect(sections.people).toEqual([bo, anna, big]);
    expect(sections.pets).toEqual([rex, tom]);
    expect(sections.unsorted).toEqual([once, stray]);
    expect(sections.hidden).toEqual([hidden]);
  });

  it('filters pets by the chosen species and counts the species chips', () => {
    expect(peopleSectionsOf(all, 'cat').pets).toEqual([tom]);
    expect(speciesChipsOf(all)).toEqual([
      { species: 'cat', count: 2 },
      { species: 'dog', count: 1 },
    ]);
  });

  it('orders equal groups by the newest change', () => {
    const older = group({ count: 2, updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = group({ count: 2, updatedAt: '2026-02-01T00:00:00.000Z' });
    expect([older, newer].sort(compareGroups)).toEqual([newer, older]);
  });

  it('names unnamed groups so every tile reads', () => {
    expect(groupTitleOf(group())).toBe('Unnamed person');
    expect(groupCaptionOf(group())).toBe('Add a name');
    expect(groupCaptionOf(rex)).toBe('Rex');
    expect(groupTitleOf(rex)).toBe('Rex');
    expect(groupTitleOf(tom)).toBe('Cat');
    expect(groupLabelOf(group({ count: 1 }))).toBe('Unnamed person, 1 photo');
    expect(groupLabelOf(bo)).toBe('Bo, 40 photos');
    expect(peopleSubtitleOf({ groups: all, mergeSuggestions: [] })).toBe('3 people · 2 pets');
    expect(peopleSubtitleOf({ groups: [], mergeSuggestions: [] })).toBeNull();
  });

  it('counts named people and pets among the sorted groups for the naming bar', () => {
    const groups = [
      group({ name: 'Ann' }),
      group(),
      group({ name: 'Old', hidden: true }),
      group({ count: 1 }),
      group({ kind: 'pet', species: 'dog', name: 'Rex' }),
    ];
    const naming = namingOf(groups);
    expect(naming).toEqual({ people: 1, pets: 1, total: 3 });
    expect(namingLineOf(naming)).toBe('2 of 3 named');
    expect(namingLineOf({ people: 2, pets: 1, total: 3 })).toBe('All 3 named');
    expect(namingLineOf({ people: 0, pets: 0, total: 0 })).toBe('People and pets');
  });

  it('offers merge targets of the same kind and species only, hidden groups last', () => {
    expect(mergeTargetsOf(anna, all)).toEqual([bo, big, once, hidden]);
    expect(mergeTargetsOf(tom, all)).toEqual([stray]);
    expect(mergeSubtitleOf(hidden)).toBe(`${String(hidden.count)} photos · Hidden`);
    expect(mergeSubtitleOf(once)).toBe('1 photo');
  });

  it('pairs merge suggestions with the stronger group first', () => {
    const suggestion: PhotoMergeSuggestion = { groupIds: [big.id, bo.id], similarity: 0.5 };
    expect(mergeCandidatesOf([suggestion], all)).toEqual([[bo, big]]);
    expect(suggestionKey(suggestion)).toBe([big.id, bo.id].sort().join('|'));
    expect(mergeCandidatesOf([suggestion], [bo])).toEqual([]);
  });

  it('words a merge suggestion by the names it has', () => {
    expect(pairLineOf(bo, anna)).toBe('Bo and Anna look alike');
    expect(pairLineOf(bo, big)).toBe('Bo and an unnamed group look alike');
    expect(pairLineOf(big, once)).toBe('These two people look alike');
    expect(pairLineOf(tom, stray)).toBe('These two pets look alike');
  });

  it('reads an empty name as no name', () => {
    expect(nameDraftOf('  ')).toBeNull();
    expect(nameDraftOf(' Anna ')).toBe('Anna');
  });
});

describe('the face crop', () => {
  it('centres the face in the circle with room around it', () => {
    const crop = faceCropOf({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, 1, 100);
    expect(crop.width).toBeCloseTo(312.5);
    expect(crop.left).toBeCloseTo(50 - 0.5 * 312.5);
    expect(crop.top).toBeCloseTo(50 - 0.5 * 312.5);
  });

  it('keeps the picture covering the circle at the edges', () => {
    const corner = faceCropOf({ x: 0, y: 0, w: 0.1, h: 0.1 }, 1.5, 64);
    expect(corner.left).toBe(0);
    expect(corner.top).toBe(0);
    const whole = faceCropOf({ x: 0, y: 0, w: 1, h: 1 }, 2, 64);
    expect(whole.height).toBeGreaterThanOrEqual(64);
    expect(whole.width).toBeGreaterThanOrEqual(64);
  });
});

describe('the people page state', () => {
  const people: PhotoPeople = { groups: [group()], mergeSuggestions: [] };
  const none: PhotoPeople = { groups: [], mergeSuggestions: [] };
  const base = { failed: false, live: true };

  it('shows groups whenever there are some', () => {
    expect(peopleStateOf({ ...base, people, status: undefined, live: false })).toBe('ready');
  });

  it('tells grouping off, indexing and nothing found apart', () => {
    expect(peopleStateOf({ ...base, people: none, status: status({ faceGrouping: false }) })).toBe(
      'grouping-off',
    );
    const busy = status({ faces: { ...PROGRESS, done: 1, queued: 3 } });
    expect(peopleStateOf({ ...base, people: none, status: busy })).toBe('indexing');
    expect(faceProgressOf(busy)).toBe(0.25);
    expect(peopleStateOf({ ...base, people: none, status: status() })).toBe('empty');
  });

  it('shows the scan progress with the photos analysed and the faces found', () => {
    const busy = status({
      total: 636,
      faces: { ...PROGRESS, done: 120, queued: 516 },
      people: { faces: 14, grouped: 0 },
    });
    expect(peopleStateOf({ ...base, people: none, status: busy })).toBe('indexing');
    expect(faceScanTextOf(busy)).toBe('Analysed 120 of 636 photos · 14 faces found');
  });

  it('says faces are being sorted when the scan is done and they are not grouped yet', () => {
    const found = status({
      total: 636,
      faces: { ...PROGRESS, done: 635 },
      people: { faces: 61, grouped: 0 },
    });
    expect(peopleStateOf({ ...base, people: none, status: found })).toBe('grouping');
    expect(groupingTextOf(found)).toBe(
      '61 faces found in 635 photos are being sorted into people.',
    );
    expect(faceProgressOf(found)).toBe(1);
    expect(groupingProgressOf(found)).toBe(0);
    expect(groupingProgressOf(status({ people: { faces: 8, grouped: 2 } }))).toBe(0.25);
    expect(groupingProgressOf(status({ people: { faces: 0, grouped: 0 } }))).toBe(0);
  });

  it('says why nothing is grouped once the scan is done', () => {
    expect(emptyReasonOf(status({ total: 0 })).title).toBe('No photos yet');
    expect(emptyReasonOf(status({ total: 4 })).title).toBe('Waiting for previews');
    expect(emptyReasonOf(status({ total: 4, faces: { ...PROGRESS, failed: 4 } }))).toEqual({
      title: 'Face analysis failed',
      body: 'Your home hub could not analyse 4 photos.',
    });
    expect(emptyReasonOf(status({ total: 4, faces: { ...PROGRESS, done: 3, failed: 1 } }))).toEqual(
      {
        title: 'No faces found',
        body: 'Your home hub analysed 3 photos and found no people in them. Face analysis failed on 1 photo.',
      },
    );
  });

  it('waits, fails and goes offline honestly', () => {
    expect(peopleStateOf({ ...base, people: undefined, status: undefined })).toBe('loading');
    expect(peopleStateOf({ ...base, people: undefined, status: undefined, failed: true })).toBe(
      'error',
    );
    expect(peopleStateOf({ ...base, people: undefined, status: undefined, live: false })).toBe(
      'offline',
    );
    expect(faceProgressOf(status())).toBe(0);
  });
});
