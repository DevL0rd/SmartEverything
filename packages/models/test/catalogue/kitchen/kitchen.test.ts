import {
  HOME_MAP_ROBOT_FURNITURE_MODEL_IDS,
  MODEL_SPEC,
  modelParamValues,
  shownParts,
  type ModelSpec,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  BASE_CABINET_RUN_MODEL,
  KITCHEN_CABINETRY_MODELS,
  KITCHEN_COLUMN_MODELS,
  KITCHEN_ISLAND_MODEL,
  OPEN_SHELF_MODEL,
  SPICE_RACK_MODEL,
  TALL_PANTRY_MODEL,
  WALL_CABINET_RUN_MODEL,
} from '../../../src/catalogue/kitchen';
import { KITCHEN_FINISH_NAMES } from '../../../src/catalogue/kitchen/fc13/kit';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';

const KITCHEN: readonly ModelSpec[] = [...KITCHEN_CABINETRY_MODELS, ...KITCHEN_COLUMN_MODELS];

const WALL_MOUNTED = new Set([WALL_CABINET_RUN_MODEL.id, OPEN_SHELF_MODEL.id, SPICE_RACK_MODEL.id]);

function visibleIds(
  spec: ModelSpec,
  pattern: RegExp,
  params: Readonly<Record<string, number>>,
): readonly string[] {
  return shownParts(spec, 2, modelParamValues(spec, params))
    .filter((entry) => pattern.test(entry.id))
    .map((entry) => entry.id);
}

describe('kitchen cabinetry and columns', () => {
  it.each(KITCHEN.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.id.startsWith('cat.kitchen.')).toBe(true);
      expect(spec.category).toBe('kitchen');
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(spec.meta?.variants).toStrictEqual([...KITCHEN_FINISH_NAMES]);
      expect(Object.keys(spec.finishes ?? {})).toStrictEqual([...KITCHEN_FINISH_NAMES]);
      expect(Object.keys(spec.states ?? {}).length).toBeGreaterThan(0);
      expect(spec.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
        mount: WALL_MOUNTED.has(spec.id) ? 'wall' : 'floor',
      });
    },
  );

  it('holds the ten items of the two tasks', () => {
    expect(new Set(KITCHEN.map((spec) => spec.id)).size).toBe(10);
  });

  it('fits one door front per full module of the base run', () => {
    expect(visibleIds(BASE_CABINET_RUN_MODEL, /^door\d$/, { length: 0.6 })).toHaveLength(1);
    expect(visibleIds(BASE_CABINET_RUN_MODEL, /^door\d$/, { length: 2.4 })).toHaveLength(4);
    expect(visibleIds(BASE_CABINET_RUN_MODEL, /^door\d$/, { length: 4.8 })).toHaveLength(8);
  });

  it('gives every visible door a pull and hides the pulls of hidden doors', () => {
    for (const spec of [BASE_CABINET_RUN_MODEL, WALL_CABINET_RUN_MODEL, KITCHEN_ISLAND_MODEL]) {
      const doors = visibleIds(spec, /^door\d$/, { length: 1.8 });
      const pulls = visibleIds(spec, /^pull\d$/, { length: 1.8 });

      expect(pulls.map((id) => id.replace('pull', ''))).toStrictEqual(
        doors.map((id) => id.replace('door', '')),
      );
    }
  });

  it('adds the middle support to the open shelf only when it is long', () => {
    expect(visibleIds(OPEN_SHELF_MODEL, /^supportMiddle$/, { length: 1.2 })).toHaveLength(0);
    expect(visibleIds(OPEN_SHELF_MODEL, /^supportMiddle$/, { length: 2.4 })).toHaveLength(1);
  });

  it('holds more spice jars on a longer rack', () => {
    const jars = (length: number): number =>
      visibleIds(SPICE_RACK_MODEL, /^jar\d+$/, { length }).length;

    expect([jars(0.3), jars(0.5), jars(0.8)]).toStrictEqual([6, 10, 16]);
  });

  it('keeps the tall pantry as tall as a room door', () => {
    expect(TALL_PANTRY_MODEL.footprint.height).toBeGreaterThan(2);
  });

  it('covers every kitchen furniture kind the robot reports', () => {
    const ids = new Set(KITCHEN.map((spec) => spec.id));
    const kitchen = HOME_MAP_ROBOT_FURNITURE_MODEL_IDS.filter((id) =>
      id.startsWith('cat.kitchen.'),
    );

    expect(kitchen.filter((id) => !ids.has(id))).toStrictEqual([]);
  });
});
