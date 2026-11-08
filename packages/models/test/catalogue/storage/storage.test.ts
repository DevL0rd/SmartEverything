import {
  MODEL_SPEC,
  modelParamValues,
  resolveModelBinding,
  shownParts,
  type ModelSpec,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { STORAGE_FINISH_NAMES } from '../../../src/catalogue/storage/fc21/kit';
import { STORAGE_BOXES_MODEL, STORAGE_HALL_MODELS } from '../../../src/catalogue/storage/fc21';
import { STEP_LADDER_MODEL, STORAGE_UTILITY_MODELS } from '../../../src/catalogue/storage/fc22';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { collapsedParts } from '../shapes';

const ALL: readonly ModelSpec[] = [...STORAGE_HALL_MODELS, ...STORAGE_UTILITY_MODELS];

function shownIds(spec: ModelSpec, params: Readonly<Record<string, number>>): readonly string[] {
  return shownParts(spec, 2, modelParamValues(spec, params)).map((part) => part.id);
}

describe('storage and utility catalogue', () => {
  it('holds the twelve items of the plan', () => {
    expect(ALL.map((spec) => spec.id)).toStrictEqual([
      'cat.storage.shelving-unit',
      'cat.storage.storage-boxes',
      'cat.storage.shoe-rack',
      'cat.storage.coat-rack',
      'cat.storage.hallway-bench',
      'cat.storage.console-table',
      'cat.storage.laundry-shelves',
      'cat.storage.ironing-board',
      'cat.storage.broom-cupboard',
      'cat.storage.toolbox',
      'cat.storage.step-ladder',
      'cat.storage.utility-sink',
    ]);
  });

  it.each(ALL.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.category).toBe('storage');
      expect(spec.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
        mount: 'floor',
      });
      expect(Object.keys(spec.finishes ?? {})).toStrictEqual([...STORAGE_FINISH_NAMES]);
      expect(spec.meta?.variants).toStrictEqual([...STORAGE_FINISH_NAMES]);
      expect(spec.defaultFinish).toBe('oak');
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(Object.keys(spec.states ?? {})).toStrictEqual(['rest']);
      expect(collapsedParts(spec)).toStrictEqual([]);
    },
  );

  it('stacks one, two or three crates by count', () => {
    const crates = (boxes: number): number =>
      shownIds(STORAGE_BOXES_MODEL, { boxes }).filter((id) => /^body\d$/.test(id)).length;

    expect([1, 2, 3].map(crates)).toStrictEqual([1, 2, 3]);
  });

  it('keeps the step ladder platform on top of the rails at every height', () => {
    const platform = STEP_LADDER_MODEL.parts.find((part) => part.id === 'platform');
    const y = platform?.transform?.position?.[1];
    if (y === undefined) throw new Error('no platform height');
    const at = (height: number): number =>
      resolveModelBinding(y, modelParamValues(STEP_LADDER_MODEL, { height }));

    expect([0.9, 1.2, 1.8].map((height) => Number((at(height) + 0.015).toFixed(6)))).toStrictEqual([
      0.9, 1.2, 1.8,
    ]);
  });
});
