import { MODEL_SPEC, modelParamValues, shownParts, type ModelSpec } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  DECOR_HOBBY_MODELS,
  DECOR_OBJECT_MODELS,
  DECOR_TEXTILE_MODELS,
  DECOR_WALL_MODELS,
} from '../../../src/catalogue/decor';
import { BOOK_STACK_MODEL, PHOTO_FRAMES_MODEL } from '../../../src/catalogue/decor/fc31';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { collapsedParts } from '../shapes';

const ALL: readonly ModelSpec[] = [
  ...DECOR_WALL_MODELS,
  ...DECOR_OBJECT_MODELS,
  ...DECOR_TEXTILE_MODELS,
  ...DECOR_HOBBY_MODELS,
];

const MOUNTS: Readonly<Record<string, string>> = {
  'cat.decor.framed-art': 'wall',
  'cat.decor.poster': 'wall',
  'cat.decor.wall-clock': 'wall',
  'cat.decor.round-mirror': 'wall',
  'cat.decor.floating-shelf': 'wall',
  'cat.decor.curtains': 'wall',
  'cat.decor.magazine-rack': 'floor',
  'cat.decor.throw-pillows': 'floor',
  'cat.decor.throw-blanket': 'floor',
  'cat.decor.guitar-stand': 'floor',
};

function shownIds(spec: ModelSpec, params: Readonly<Record<string, number>>): readonly string[] {
  return shownParts(spec, 2, modelParamValues(spec, params)).map((part) => part.id);
}

describe('decor catalogue', () => {
  it('holds the twenty items of the plan', () => {
    expect(ALL.map((spec) => spec.id)).toStrictEqual([
      'cat.decor.framed-art',
      'cat.decor.poster',
      'cat.decor.wall-clock',
      'cat.decor.round-mirror',
      'cat.decor.vase',
      'cat.decor.candle-set',
      'cat.decor.abstract-sculpture',
      'cat.decor.book-stack',
      'cat.decor.magazine-rack',
      'cat.decor.globe',
      'cat.decor.decorative-bowl',
      'cat.decor.photo-frames',
      'cat.decor.floating-shelf',
      'cat.decor.curtains',
      'cat.decor.throw-pillows',
      'cat.decor.throw-blanket',
      'cat.decor.record-player',
      'cat.decor.guitar-stand',
      'cat.decor.chess-set',
      'cat.decor.lamp-shade',
    ]);
  });

  it.each(ALL.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.category).toBe('decor');
      expect(spec.anchors?.find((anchor) => anchor.kind === 'mount')?.mount).toBe(
        MOUNTS[spec.id] ?? 'desk',
      );
      expect(Object.keys(spec.finishes ?? {})).toStrictEqual(spec.meta?.variants);
      expect(spec.defaultFinish).toBeDefined();
      expect(Object.keys(spec.finishes ?? {})).toContain(spec.defaultFinish);
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(Object.keys(spec.states ?? {})).toStrictEqual(['rest']);
      expect(collapsedParts(spec)).toStrictEqual([]);
    },
  );

  it('stacks one cover per book and no more', () => {
    const covers = (books: number): number =>
      shownIds(BOOK_STACK_MODEL, { books }).filter((id) => /^cover\d$/.test(id)).length;

    expect([2, 4, 6].map(covers)).toStrictEqual([2, 4, 6]);
  });

  it('stands one frame per count with its mat, photo, hill and strut', () => {
    const frames = (count: number): number =>
      shownIds(PHOTO_FRAMES_MODEL, { frames: count }).filter((id) => /^frame[ABC]$/.test(id))
        .length;
    const parts = (count: number): number => shownIds(PHOTO_FRAMES_MODEL, { frames: count }).length;

    expect([1, 2, 3].map(frames)).toStrictEqual([1, 2, 3]);
    expect([1, 2, 3].map(parts)).toStrictEqual([5, 10, 15]);
  });
});
