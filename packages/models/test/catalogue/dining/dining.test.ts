import {
  HOME_MAP_ROBOT_FURNITURE_MODEL_IDS,
  MODEL_SPEC,
  modelParamValues,
  resolveModelBinding,
  shownParts,
  type ModelSpec,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  DINING_STORAGE_MODELS,
  DINING_TABLE_MODELS,
  DINING_TABLE_RECTANGLE_MODEL,
  DINING_TABLE_ROUND_MODEL,
  BAR_STOOL_MODEL,
  HIGH_TABLE_MODEL,
} from '../../../src/catalogue/dining';
import { WOODS } from '../../../src/catalogue/living/fc06/kit';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';

const DINING: readonly ModelSpec[] = [...DINING_TABLE_MODELS, ...DINING_STORAGE_MODELS];

function chairs(spec: ModelSpec, params: Readonly<Record<string, number>>): readonly string[] {
  return shownParts(spec, 1, modelParamValues(spec, params))
    .filter((entry) => /^chair\w+Seat$/.test(entry.id))
    .map((entry) => entry.id);
}

function chairX(spec: ModelSpec, id: string, params: Readonly<Record<string, number>>): number {
  const position = spec.parts.find((entry) => entry.id === id)?.transform?.position?.[0];
  if (position === undefined) throw new Error(`${id} has no position`);
  return resolveModelBinding(position, modelParamValues(spec, params));
}

function topWidth(spec: ModelSpec, params: Readonly<Record<string, number>>): number {
  const geometry = spec.parts.find((entry) => entry.id === 'top')?.geometry;
  if (geometry?.type !== 'roundedBox') throw new Error('top is not a box');
  return resolveModelBinding(geometry.width, modelParamValues(spec, params));
}

describe('dining catalogue', () => {
  it.each(DINING.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.id.startsWith('cat.dining.')).toBe(true);
      expect(spec.category).toBe('dining');
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(spec.meta?.variants).toStrictEqual(Object.keys(spec.finishes ?? {}));
      expect(Object.keys(spec.states ?? {}).length).toBeGreaterThan(0);
      expect(spec.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
        mount: 'floor',
      });
    },
  );

  it('holds the eight items of the category', () => {
    expect(new Set(DINING.map((spec) => spec.id)).size).toBe(8);
  });

  it('offers oak, walnut and white lacquer on every item', () => {
    for (const spec of DINING) {
      expect(Object.keys(spec.finishes ?? {})).toStrictEqual([...WOODS]);
      expect(spec.defaultFinish).toBe('oak');
    }
  });

  it('seats exactly the requested number around the rectangular table', () => {
    for (const seats of [4, 5, 6, 7, 8, 9, 10]) {
      expect(chairs(DINING_TABLE_RECTANGLE_MODEL, { seats })).toHaveLength(seats);
    }
  });

  it('keeps every chair beside the table top for every seat count', () => {
    for (const seats of [4, 5, 6, 7, 8, 9, 10]) {
      const half = topWidth(DINING_TABLE_RECTANGLE_MODEL, { seats }) / 2;
      for (const id of chairs(DINING_TABLE_RECTANGLE_MODEL, { seats })) {
        expect(Math.abs(chairX(DINING_TABLE_RECTANGLE_MODEL, id, { seats }))).toBeLessThan(half);
      }
    }
  });

  it('adds the diagonal chairs to the round table only when it is wide enough', () => {
    expect(chairs(DINING_TABLE_ROUND_MODEL, { diameter: 1.2 })).toHaveLength(4);
    expect(chairs(DINING_TABLE_ROUND_MODEL, { diameter: 1.5 })).toHaveLength(4);
    expect(chairs(DINING_TABLE_ROUND_MODEL, { diameter: 1.8 })).toHaveLength(8);
  });

  it('shows the seat of every chair from the smallest level of detail', () => {
    const tile = shownParts(
      DINING_TABLE_RECTANGLE_MODEL,
      0,
      modelParamValues(DINING_TABLE_RECTANGLE_MODEL, { seats: 10 }),
    );

    expect(tile.filter((entry) => entry.id.endsWith('Seat'))).toHaveLength(10);
    expect(tile.some((entry) => entry.id.endsWith('Splat'))).toBe(false);
  });

  it('raises the bar stool and its footrest with the seat height', () => {
    const low = modelParamValues(BAR_STOOL_MODEL, { height: 0.55 });
    const high = modelParamValues(BAR_STOOL_MODEL, { height: 0.8 });
    const seat = BAR_STOOL_MODEL.parts.find((entry) => entry.id === 'seat')?.transform
      ?.position?.[1];
    if (seat === undefined) throw new Error('no seat position');

    expect(resolveModelBinding(seat, high) - resolveModelBinding(seat, low)).toBeCloseTo(0.25);
  });

  it('keeps the high table at bar height whatever its size', () => {
    expect(HIGH_TABLE_MODEL.footprint.height).toBeCloseTo(1.05);
  });

  it('covers every dining furniture kind the robot reports', () => {
    const ids = new Set(DINING.map((spec) => spec.id));
    const dining = HOME_MAP_ROBOT_FURNITURE_MODEL_IDS.filter((id) => id.startsWith('cat.dining.'));

    expect(dining.filter((id) => !ids.has(id))).toStrictEqual([]);
  });
});
