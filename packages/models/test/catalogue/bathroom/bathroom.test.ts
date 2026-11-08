import {
  HOME_MAP_ROBOT_FURNITURE_MODEL_IDS,
  MODEL_SPEC,
  modelParamValues,
  resolveModelBinding,
  shownParts,
  type ModelSpec,
  type ModelSpecBindable,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { BATHROOM_FITTING_MODELS, BATHROOM_FIXTURE_MODELS } from '../../../src/catalogue/bathroom';
import { BUILT_IN_BATH_MODEL, VANITY_MODEL } from '../../../src/catalogue/bathroom/fc17';
import { BATH_FINISH_NAMES } from '../../../src/catalogue/bathroom/fc17/kit';
import { SHOWER_ENCLOSURE_MODEL, TOWEL_RAIL_MODEL } from '../../../src/catalogue/bathroom/fc18';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { collapsedParts } from '../shapes';

const BATHROOM: readonly ModelSpec[] = [...BATHROOM_FIXTURE_MODELS, ...BATHROOM_FITTING_MODELS];

function part(spec: ModelSpec, id: string): ModelSpec['parts'][number] {
  const found = spec.parts.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`${spec.id} has no part ${id}`);
  return found;
}

function at(spec: ModelSpec, value: ModelSpecBindable, params: Record<string, number>): number {
  return resolveModelBinding(value, modelParamValues(spec, params));
}

function shownIds(spec: ModelSpec, params: Record<string, number>): readonly string[] {
  return shownParts(spec, 2, modelParamValues(spec, params)).map((entry) => entry.id);
}

describe('bathroom catalogue', () => {
  it.each(BATHROOM.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.id.startsWith('cat.bathroom.')).toBe(true);
      expect(spec.category).toBe('bathroom');
      expect(spec.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
        mount: 'floor',
      });
      expect(Object.keys(spec.finishes ?? {})).toStrictEqual([...BATH_FINISH_NAMES]);
      expect(spec.meta?.variants).toStrictEqual([...BATH_FINISH_NAMES]);
      expect(spec.defaultFinish).toBe('ceramic-white');
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(Object.keys(spec.states ?? {}).length).toBeGreaterThan(0);
      expect(collapsedParts(spec)).toStrictEqual([]);
    },
  );

  it('holds the twelve items of the category', () => {
    expect(new Set(BATHROOM.map((spec) => spec.id)).size).toBe(12);
  });

  it('covers every bathroom furniture kind the robot reports', () => {
    const ids = new Set(BATHROOM.map((spec) => spec.id));
    const bathroom = HOME_MAP_ROBOT_FURNITURE_MODEL_IDS.filter((id) =>
      id.startsWith('cat.bathroom.'),
    );

    expect(bathroom.length).toBeGreaterThan(0);
    expect(bathroom.filter((id) => !ids.has(id))).toStrictEqual([]);
  });

  it('recolours the fixtures per finish and leaves the glass alone', () => {
    const finishes = SHOWER_ENCLOSURE_MODEL.finishes ?? {};

    expect(finishes['matte-black']?.['accent']).toStrictEqual({ finish: 'satin-black' });
    expect(finishes['brushed-brass']?.['accent']).toMatchObject({ color: '#B8975A', metalness: 1 });
    expect(finishes['terrazzo']?.['ware']).toStrictEqual({ finish: 'terrazzo' });
    expect(Object.values(finishes).every((slots) => slots['glass'] === undefined)).toBe(true);
  });

  it('cuts the vanity basin out of the top with a second contour', () => {
    const geometry = part(VANITY_MODEL, 'basinTop').geometry;
    if (geometry.type !== 'extrude') throw new Error('no extruded top');

    expect(geometry.path.filter((command) => command.op === 'move')).toHaveLength(2);
  });

  it('keeps the vanity top slab flush with its side and overlapping the basin piece', () => {
    const slab = part(VANITY_MODEL, 'topRight');
    const door = part(VANITY_MODEL, 'doorLeft');
    if (slab.geometry.type !== 'roundedBox' || door.geometry.type !== 'roundedBox') {
      throw new Error('boxes expected');
    }
    const span = slab.geometry.width;
    const edges = (width: number): readonly number[] => {
      const centre = at(VANITY_MODEL, slab.transform?.position?.[0] ?? 0, { width });
      const half = at(VANITY_MODEL, span, { width }) / 2;
      return [centre - half, centre + half];
    };

    expect(edges(0.6)).toStrictEqual([expect.closeTo(0.22, 6), expect.closeTo(0.3, 6)]);
    expect(edges(1.5)).toStrictEqual([expect.closeTo(0.22, 6), expect.closeTo(0.75, 6)]);
    expect(at(VANITY_MODEL, door.geometry.width, { width: 1.5 })).toBeCloseTo(0.71, 6);
  });

  it('puts the built-in bath tub scale on its length', () => {
    const scale = part(BUILT_IN_BATH_MODEL, 'tub').transform?.scale?.[0];
    if (scale === undefined) throw new Error('tub has no scale');

    const scaleAt = (length: number): number => at(BUILT_IN_BATH_MODEL, scale, { length });

    expect(scaleAt(1.5)).toBeCloseTo(1.5 / 1.7, 6);
    expect(scaleAt(1.7)).toBeCloseTo(1, 6);
    expect(scaleAt(1.9)).toBeCloseTo(1.9 / 1.7, 6);
  });

  it('spreads eight rungs evenly over the towel rail height', () => {
    const rungs = TOWEL_RAIL_MODEL.parts.filter((entry) => /^rung\d$/.test(entry.id));
    const heights = (height: number): number[] =>
      rungs.map((rung) => at(TOWEL_RAIL_MODEL, rung.transform?.position?.[1] ?? 0, { height }));

    expect(rungs).toHaveLength(8);
    expect(heights(1.6)[0]).toBeCloseTo(0.1, 6);
    expect(heights(1.6)[7]).toBeCloseTo(1.5, 6);
    expect(heights(0.8)[7]).toBeCloseTo(0.75, 6);
  });

  it('sizes the enclosure glass to its two params and keeps every part at the lowest detail', () => {
    const door = part(SHOWER_ENCLOSURE_MODEL, 'doorGlass').geometry;
    const side = part(SHOWER_ENCLOSURE_MODEL, 'sideGlass').geometry;
    if (door.type !== 'roundedBox' || side.type !== 'roundedBox') throw new Error('boxes expected');

    expect(at(SHOWER_ENCLOSURE_MODEL, door.width, { width: 0.7, depth: 1.4 })).toBeCloseTo(0.63, 6);
    expect(at(SHOWER_ENCLOSURE_MODEL, side.depth, { width: 0.7, depth: 1.4 })).toBeCloseTo(1.33, 6);
    expect(shownIds(SHOWER_ENCLOSURE_MODEL, {})).toContain('rainHead');
  });
});
