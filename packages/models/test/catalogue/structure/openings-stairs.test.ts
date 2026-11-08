import {
  MODEL_SPEC,
  modelParamValues,
  resolveModelBinding,
  type ModelSpec,
  type ModelSpecPart,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring, paramPresets } from '../../../src/index';
import { STRUCTURE_FINISH_NAMES } from '../../../src/catalogue/structure/fc01/look';
import {
  SKYLIGHT_MODEL,
  STRUCTURE_WINDOW_MODELS,
  WINDOW_CASEMENT_MODEL,
  WINDOW_FLOOR_TO_CEILING_MODEL,
  WINDOW_SLIDING_MODEL,
} from '../../../src/catalogue/structure/fc04';
import {
  BALCONY_RAILING_MODEL,
  RADIATOR_MODEL,
  STAIR_RAILING_MODEL,
  STAIRS_L_MODEL,
  STAIRS_STRAIGHT_MODEL,
  STRUCTURE_STAIR_MODELS,
} from '../../../src/catalogue/structure/fc05';

const ALL: readonly ModelSpec[] = [...STRUCTURE_WINDOW_MODELS, ...STRUCTURE_STAIR_MODELS];

type Params = Readonly<Record<string, number>>;

function partOf(spec: ModelSpec, id: string): ModelSpecPart {
  const found = spec.parts.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no part ${id}`);
  return found;
}

function at(
  spec: ModelSpec,
  params: Params,
): (value: Parameters<typeof resolveModelBinding>[0]) => number {
  const values = modelParamValues(spec, params);
  return (value) => resolveModelBinding(value, values);
}

function boxSize(spec: ModelSpec, id: string, params: Params): readonly [number, number, number] {
  const { geometry } = partOf(spec, id);
  if (geometry.type !== 'roundedBox') throw new Error(`${id} is not a box`);
  const resolve = at(spec, params);
  return [resolve(geometry.width), resolve(geometry.height), resolve(geometry.depth)];
}

function position(spec: ModelSpec, id: string, params: Params): readonly [number, number, number] {
  const [x, y, z] = partOf(spec, id).transform?.position ?? [0, 0, 0];
  const resolve = at(spec, params);
  return [resolve(x), resolve(y), resolve(z)];
}

function angle(spec: ModelSpec, channelId: string): number {
  const channel = spec.channels?.find((entry) => entry.id === channelId);
  if (channel?.map.type !== 'linear') throw new Error(`no linear channel ${channelId}`);
  return channel.map.out[1];
}

describe('window and stair catalogue', () => {
  it.each(ALL.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.id.startsWith('cat.structure.')).toBe(true);
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(Object.keys(spec.finishes ?? {}).sort()).toStrictEqual(
        [...STRUCTURE_FINISH_NAMES].sort(),
      );
      expect(spec.meta?.variants).toStrictEqual([...STRUCTURE_FINISH_NAMES]);
      expect(spec.defaultFinish).toBeDefined();
    },
  );

  it('opens every window from the open signal, rests closed and carries an opening shot', () => {
    for (const spec of STRUCTURE_WINDOW_MODELS) {
      const channels = spec.channels ?? [];
      expect(channels.length).toBeGreaterThan(0);
      expect(channels.every((channel) => channel.source === 'open')).toBe(true);
      expect(spec.states?.['closed']).toStrictEqual({ open: 0 });
      expect(spec.shots?.[0]?.when.anyOf[0]?.allOf[0]).toMatchObject({ signal: 'open', op: 'gt' });
      expect(spec.shots?.[0]?.focus).toBeDefined();
    }
  });

  it('swings the casement sashes outwards in opposite directions about their own hinges', () => {
    expect(angle(WINDOW_CASEMENT_MODEL, 'leftSwing')).toBeGreaterThan(0);
    expect(angle(WINDOW_CASEMENT_MODEL, 'rightSwing')).toBeLessThan(0);
    expect(partOf(WINDOW_CASEMENT_MODEL, 'glassLeft').parent).toBe('pivotLeft');
    expect(partOf(WINDOW_CASEMENT_MODEL, 'glassRight').parent).toBe('pivotRight');
    for (const [, params] of paramPresets(WINDOW_CASEMENT_MODEL)) {
      const [leftX] = position(WINDOW_CASEMENT_MODEL, 'pivotLeft', params);
      const [rightX] = position(WINDOW_CASEMENT_MODEL, 'pivotRight', params);
      const [width] = boxSize(WINDOW_CASEMENT_MODEL, 'stileLeftLeft', params);
      expect(leftX).toBeCloseTo(-rightX);
      expect(width).toBeGreaterThan(0);
      const resolve = at(WINDOW_CASEMENT_MODEL, params);
      const glass = partOf(WINDOW_CASEMENT_MODEL, 'glassLeft').geometry;
      if (glass.type !== 'roundedPlane') throw new Error('glass is a plane');
      expect(resolve(glass.width)).toBeGreaterThan(0.1);
      expect(resolve(glass.height)).toBeGreaterThan(0.2);
    }
  });

  it('keeps the sliding sash inside the frame at full travel for every width', () => {
    const channel = WINDOW_SLIDING_MODEL.channels?.[0];
    expect(channel).toMatchObject({ target: 'glassSlide', property: 'translate', axis: 'x' });
    const travel = angle(WINDOW_SLIDING_MODEL, 'paneSlide');
    for (const [, params] of paramPresets(WINDOW_SLIDING_MODEL)) {
      const [slideX] = position(WINDOW_SLIDING_MODEL, 'glassSlide', params);
      const [fixedX] = position(WINDOW_SLIDING_MODEL, 'glassFixed', params);
      const resolve = at(WINDOW_SLIDING_MODEL, params);
      const glass = partOf(WINDOW_SLIDING_MODEL, 'glassSlide').geometry;
      if (glass.type !== 'roundedPlane') throw new Error('glass is a plane');
      const outer = resolve(glass.width) + 0.08 - 0.016;
      const frameInner = boxSize(WINDOW_SLIDING_MODEL, 'frameHead', params)[0] / 2;
      expect(slideX + outer / 2 + travel).toBeLessThanOrEqual(frameInner + 1e-9);
      expect(slideX).toBeCloseTo(-fixedX);
    }
    const lanes = ['glassSlide', 'glassFixed'].map(
      (id) => position(WINDOW_SLIDING_MODEL, id, {}).at(2) ?? 0,
    );
    expect(lanes[0]).toBeGreaterThan(lanes[1] ?? 0);
  });

  it('hinges the floor-to-ceiling vent on its right edge and the skylight along its back edge', () => {
    expect(angle(WINDOW_FLOOR_TO_CEILING_MODEL, 'ventSwing')).toBeLessThan(0);
    expect(partOf(WINDOW_FLOOR_TO_CEILING_MODEL, 'glassVent').parent).toBe('pivotVent');
    const lift = SKYLIGHT_MODEL.channels?.[0];
    expect(lift).toMatchObject({ target: 'pivot', property: 'rotate', axis: 'x' });
    expect(angle(SKYLIGHT_MODEL, 'lift')).toBeLessThan(0);
    for (const part of SKYLIGHT_MODEL.parts.filter((entry) => entry.id.startsWith('leaf'))) {
      expect(part.parent).toBe('pivot');
    }
  });

  it('builds stairs that climb exactly the floor-to-floor height at every height', () => {
    for (const spec of [STAIRS_STRAIGHT_MODEL, STAIRS_L_MODEL]) {
      const treads = spec.parts.filter((entry) => entry.id.startsWith('tread'));
      for (const [, params] of paramPresets(spec)) {
        const tops = treads.map((entry) => position(spec, entry.id, params)[1]);
        expect(Math.max(...tops) + 0.01).toBeCloseTo(params['height'] ?? 0);
      }
    }
    const straight = STAIRS_STRAIGHT_MODEL.parts.filter((entry) => entry.id.startsWith('tread'));
    expect(straight).toHaveLength(14);
    const heights = straight.map((entry) => position(STAIRS_STRAIGHT_MODEL, entry.id, {})[1]);
    const rises = heights.slice(1).map((value, index) => value - (heights[index] ?? 0));
    for (const rise of rises) expect(rise).toBeCloseTo(0.2);
  });

  it('turns the L stairs through a landing at half height with a hanging upper flight', () => {
    const landing = position(STAIRS_L_MODEL, 'landing', {});
    const lower = position(STAIRS_L_MODEL, 'treadLower6', {});
    const upper = position(STAIRS_L_MODEL, 'treadUpper1', {});
    expect(landing[1]).toBeCloseTo(0.7);
    expect(upper[1]).toBeGreaterThan(position(STAIRS_L_MODEL, 'treadLanding', {})[1]);
    expect(upper[0]).toBeLessThan(landing[0]);
    expect(lower[2]).toBeGreaterThan(landing[2]);
    expect(partOf(STAIRS_L_MODEL, 'flightUpper').transform?.rotation?.[1]).toBe(180);
  });

  it('follows the stair slope with the stair railing', () => {
    const rail = partOf(STAIR_RAILING_MODEL, 'handrail');
    const tilt = rail.transform?.rotation?.[0];
    if (typeof tilt !== 'number') throw new Error('handrail rotates');
    expect(Math.tan(((90 + tilt) * Math.PI) / 180)).toBeCloseTo(0.2 / 0.26);
    const bars = partOf(STAIR_RAILING_MODEL, 'balusters').geometry;
    if (bars.type !== 'extrude') throw new Error('balusters extrude');
    expect(bars.path.filter((command) => command.op === 'move')).toHaveLength(12);
  });

  it('keeps the balcony panels between evenly spaced posts for every length', () => {
    for (const [, params] of paramPresets(BALCONY_RAILING_MODEL)) {
      const xs = [1, 2, 3, 4].map(
        (n) => position(BALCONY_RAILING_MODEL, `post${String(n)}`, params)[0],
      );
      const spacing = (xs[3] ?? 0) - (xs[0] ?? 0);
      expect(spacing).toBeCloseTo((params['length'] ?? 0) - 0.05);
      const glass = boxSizeOfPlane(BALCONY_RAILING_MODEL, 'glass2', params);
      expect(glass[0]).toBeGreaterThan(0.2);
      expect(glass[1]).toBeCloseTo((params['height'] ?? 0) - 0.14);
    }
  });

  it('hangs the radiator clear of the floor at every size', () => {
    for (const [, params] of paramPresets(RADIATOR_MODEL)) {
      const [width, height] = boxSize(RADIATOR_MODEL, 'body', params);
      expect(width).toBeCloseTo(params['width'] ?? 0);
      const [, y] = position(RADIATOR_MODEL, 'body', params);
      expect(y - height / 2).toBeCloseTo(0.12);
    }
  });
});

function boxSizeOfPlane(spec: ModelSpec, id: string, params: Params): readonly [number, number] {
  const { geometry } = partOf(spec, id);
  if (geometry.type !== 'roundedPlane') throw new Error(`${id} is not a plane`);
  const resolve = at(spec, params);
  return [resolve(geometry.width), resolve(geometry.height)];
}
