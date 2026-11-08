import { MODEL_SPEC, type ModelSpec } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring, paramPresets, resolveBindable } from '../../../src/index';
import {
  STRUCTURE_DETAIL_MODELS,
  STRUCTURE_DOOR_MODELS,
  STRUCTURE_WALL_MODELS,
} from '../../../src/catalogue/structure';
import { STRUCTURE_FINISH_NAMES } from '../../../src/catalogue/structure/fc01/look';
import { FIREPLACE_MODEL, FLOOR_SLAB_MODEL } from '../../../src/catalogue/structure/fc02';
import {
  DOOR_DOUBLE_MODEL,
  DOOR_POCKET_MODEL,
  DOOR_SLIDING_GLASS_MODEL,
} from '../../../src/catalogue/structure/fc03';

const ALL: readonly ModelSpec[] = [
  ...STRUCTURE_WALL_MODELS,
  ...STRUCTURE_DETAIL_MODELS,
  ...STRUCTURE_DOOR_MODELS,
];

function part(spec: ModelSpec, id: string): ModelSpec['parts'][number] {
  const found = spec.parts.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no part ${id}`);
  return found;
}

function boxWidth(spec: ModelSpec, id: string, params: Readonly<Record<string, number>>): number {
  const { geometry } = part(spec, id);
  if (geometry.type !== 'roundedBox') throw new Error(`${id} is not a box`);
  return resolveBindable(geometry.width, params);
}

describe('structure catalogue', () => {
  it.each(ALL.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.id.startsWith('cat.structure.')).toBe(true);
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(Object.keys(spec.states ?? {}).length).toBeGreaterThan(0);
    },
  );

  it('offers the five structure finishes on every item except the floor slab', () => {
    for (const spec of ALL.filter((entry) => entry !== FLOOR_SLAB_MODEL)) {
      expect(Object.keys(spec.finishes ?? {}).sort()).toStrictEqual(
        [...STRUCTURE_FINISH_NAMES].sort(),
      );
      expect(spec.meta?.variants).toStrictEqual([...STRUCTURE_FINISH_NAMES]);
    }
    expect(Object.keys(FLOOR_SLAB_MODEL.finishes ?? {})).toStrictEqual([
      'tile',
      'oak',
      'concrete',
      'carpet',
      'terrazzo',
    ]);
  });

  it('keeps the piers beside every opening solid across the whole width range', () => {
    for (const spec of ALL.filter((entry) => entry.parts.some((p) => p.id === 'pierLeft'))) {
      for (const [, params] of paramPresets(spec)) {
        expect(boxWidth(spec, 'pierLeft', params)).toBeGreaterThan(0.1);
        expect(boxWidth(spec, 'pierRight', params)).toBeCloseTo(boxWidth(spec, 'pierLeft', params));
      }
    }
  });

  it('opens every door from the open signal and rests closed', () => {
    for (const spec of STRUCTURE_DOOR_MODELS) {
      const channels = spec.channels ?? [];
      expect(channels.length).toBeGreaterThan(0);
      expect(channels.every((channel) => channel.source === 'open')).toBe(true);
      expect(spec.states?.['closed']).toStrictEqual({ open: 0 });
      expect(spec.shots?.[0]?.when.anyOf[0]?.allOf[0]).toMatchObject({ signal: 'open', op: 'gt' });
    }
  });

  it('swings the double door leaves away from the viewer in opposite directions', () => {
    const outs = (DOOR_DOUBLE_MODEL.channels ?? []).map((channel) =>
      channel.map.type === 'linear' ? channel.map.out[1] : 0,
    );
    expect(outs).toStrictEqual([95, -95]);
    expect(part(DOOR_DOUBLE_MODEL, 'leafLeft').parent).toBe('hingeLeft');
    expect(part(DOOR_DOUBLE_MODEL, 'leafRight').parent).toBe('hingeRight');
  });

  it('slides the sliding and pocket leaves along the wall', () => {
    for (const spec of [DOOR_SLIDING_GLASS_MODEL, DOOR_POCKET_MODEL]) {
      expect(spec.channels?.[0]).toMatchObject({ property: 'translate', axis: 'x' });
    }
  });

  it('hides the fire while off and lights and flickers it while on', () => {
    expect(FIREPLACE_MODEL.materials['accent']?.opacity).toBe(0);
    const channels = FIREPLACE_MODEL.channels ?? [];
    expect(channels.every((channel) => channel.source === 'power')).toBe(true);
    expect(channels.filter((channel) => channel.motion.type === 'pulse')).toHaveLength(4);
    const periods = channels.flatMap((channel) =>
      channel.motion.type === 'pulse' ? [channel.motion.periodS] : [],
    );
    const loop = FIREPLACE_MODEL.shots?.[0]?.loopS ?? 0;
    expect(periods.every((period) => Number.isInteger(Number((loop / period).toFixed(6))))).toBe(
      true,
    );
  });
});
