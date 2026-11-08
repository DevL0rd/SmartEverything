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
import { OFFICE_DESK_MODELS, OFFICE_STORAGE_MODELS } from '../../../src/catalogue/office';
import {
  GAMING_CHAIR_MODEL,
  OFFICE_CHAIR_MODEL,
  STANDING_DESK_MODEL,
} from '../../../src/catalogue/office/fc19';
import {
  BOOKCASE_MODEL,
  DESK_MAT_MODEL,
  FILING_CABINET_MODEL,
} from '../../../src/catalogue/office/fc20';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { collapsedParts } from '../shapes';

const OFFICE: readonly ModelSpec[] = [...OFFICE_DESK_MODELS, ...OFFICE_STORAGE_MODELS];

const ON_DESK: ReadonlySet<string> = new Set([
  'cat.office.monitor-arm',
  'cat.office.desk-organiser',
  'cat.office.desk-mat',
]);

function part(spec: ModelSpec, id: string): ModelSpec['parts'][number] {
  const found = spec.parts.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`${spec.id} has no part ${id}`);
  return found;
}

function at(
  spec: ModelSpec,
  value: ModelSpecBindable | undefined,
  params: Record<string, number>,
): number {
  if (value === undefined) throw new Error('missing value');
  return resolveModelBinding(value, modelParamValues(spec, params));
}

function shownIds(spec: ModelSpec, params: Record<string, number>): readonly string[] {
  return shownParts(spec, 2, modelParamValues(spec, params)).map((entry) => entry.id);
}

describe('office catalogue', () => {
  it.each(OFFICE.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.id.startsWith('cat.office.')).toBe(true);
      expect(spec.category).toBe('office');
      expect(spec.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
        mount: ON_DESK.has(spec.id) ? 'desk' : 'floor',
      });
      expect(spec.meta?.variants).toStrictEqual(Object.keys(spec.finishes ?? {}));
      expect(Object.keys(spec.finishes ?? {})).toContain(spec.defaultFinish);
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(Object.keys(spec.states ?? {}).length).toBeGreaterThan(0);
      expect(collapsedParts(spec)).toStrictEqual([]);
    },
  );

  it('holds the twelve items of the category', () => {
    expect(new Set(OFFICE.map((spec) => spec.id)).size).toBe(12);
  });

  it('covers every office furniture kind the robot reports', () => {
    const ids = new Set(OFFICE.map((spec) => spec.id));
    const office = HOME_MAP_ROBOT_FURNITURE_MODEL_IDS.filter((id) => id.startsWith('cat.office.'));

    expect(office.length).toBeGreaterThan(0);
    expect(office.filter((id) => !ids.has(id))).toStrictEqual([]);
  });

  it('draws one drawer front per count', () => {
    const fronts = (drawers: number): readonly string[] =>
      shownIds(FILING_CABINET_MODEL, { drawers }).filter((id) => /^front\d$/.test(id));

    expect([2, 3, 4].map((drawers) => fronts(drawers).length)).toStrictEqual([2, 3, 4]);
    expect(shownIds(FILING_CABINET_MODEL, { drawers: 2 })).not.toContain('handle3');
  });

  it('grows the filing cabinet carcass by one drawer pitch per drawer', () => {
    const geometry = part(FILING_CABINET_MODEL, 'carcass').geometry;
    if (geometry.type !== 'roundedBox') throw new Error('no carcass box');

    const heightAt = (drawers: number): number =>
      at(FILING_CABINET_MODEL, geometry.height, { drawers });

    expect(heightAt(2)).toBeCloseTo(0.63, 6);
    expect(heightAt(3)).toBeCloseTo(0.93, 6);
    expect(heightAt(4)).toBeCloseTo(1.23, 6);
  });

  it('raises the standing desk top and telescopes the inner columns with its height', () => {
    const top = part(STANDING_DESK_MODEL, 'top').transform?.position?.[1];
    const inner = part(STANDING_DESK_MODEL, 'innerL').geometry;
    if (inner.type !== 'roundedBox') throw new Error('no inner column');

    expect(at(STANDING_DESK_MODEL, top, { height: 0.65 })).toBeCloseTo(0.6375, 6);
    expect(at(STANDING_DESK_MODEL, top, { height: 1.25 })).toBeCloseTo(1.2375, 6);
    expect(at(STANDING_DESK_MODEL, inner.height, { height: 0.65 })).toBeGreaterThan(0);
    expect(at(STANDING_DESK_MODEL, inner.height, { height: 1.25 })).toBeCloseTo(0.835, 6);
  });

  it('lifts every seat part of both chairs with the gas lift and keeps the base on the floor', () => {
    const rise = (spec: ModelSpec, id: string): number => {
      const y = part(spec, id).transform?.position?.[1];
      const [low, high] =
        spec.params?.['lift'] === undefined
          ? [0, 0]
          : [spec.params['lift'].min, spec.params['lift'].max];
      return at(spec, y, { lift: high }) - at(spec, y, { lift: low });
    };

    expect(rise(OFFICE_CHAIR_MODEL, 'cushion')).toBeCloseTo(0.12, 6);
    expect(rise(GAMING_CHAIR_MODEL, 'cushion')).toBeCloseTo(0.12, 6);
    expect(rise(OFFICE_CHAIR_MODEL, 'spoke1')).toBe(0);
    expect(shownIds(OFFICE_CHAIR_MODEL, {}).filter((id) => /^spoke\d$/.test(id))).toHaveLength(5);
    expect(shownIds(GAMING_CHAIR_MODEL, {}).filter((id) => /^wheel\d$/.test(id))).toHaveLength(5);
  });

  it('recolours the gaming chair shell and trim together', () => {
    const finishes = GAMING_CHAIR_MODEL.finishes ?? {};

    expect(Object.keys(finishes)).toStrictEqual([
      'carbon-red',
      'arctic-blue',
      'slate-lime',
      'ink-orange',
    ]);
    expect(finishes['arctic-blue']?.['accent']).toMatchObject({ color: '#2F6FB5' });
    expect(finishes['arctic-blue']?.['shell']).toMatchObject({ color: '#E3E4E8' });
  });

  it('keeps every bookcase shelf and book row inside the case at both heights', () => {
    const spacing = part(BOOKCASE_MODEL, 'shelves').geometry;
    if (spacing.type !== 'slats') throw new Error('shelves are slats');
    const rows = BOOKCASE_MODEL.parts.filter((entry) => /^booksSlate\d$/.test(entry.id));

    expect(rows).toHaveLength(4);
    for (const height of [1.4, 2.2]) {
      const top = at(BOOKCASE_MODEL, rows[3]?.transform?.position?.[1], { height });
      expect(at(BOOKCASE_MODEL, spacing.spacing, { height })).toBeCloseTo(height * 0.2, 6);
      expect(top + 0.12).toBeLessThan(height);
    }
  });

  it('widens the desk mat edge stitching with the mat', () => {
    const stitch = part(DESK_MAT_MODEL, 'stitchBack').geometry;
    if (stitch.type !== 'roundedBox') throw new Error('no stitch box');

    expect(at(DESK_MAT_MODEL, stitch.width, { width: 1.2, depth: 0.4 })).toBeCloseTo(1.15, 6);
  });
});
