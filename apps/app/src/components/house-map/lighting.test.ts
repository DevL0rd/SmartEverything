import type { ModelSpec } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  DAYLIGHT,
  DUSK,
  LIGHT_POOL_REACH_M,
  floorLighting,
  kelvinColour,
  lightEmitterFacts,
  litRoomNames,
} from './lighting';
import { pooledLightAt } from './light-blend';
import { input, ON, placement } from './lighting-fixture';

const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 } as const;

function stripSpec(): ModelSpec {
  const emitter = (id: string, x: number): NonNullable<ModelSpec['anchors']>[number] => ({
    kind: 'emitter',
    id,
    position: [x, 0, 0],
    color: '#FF0000',
    intensity: 1,
    radius: 0.05,
  });
  return {
    schema: 1,
    id: 'dev.test.strip',
    version: '1.0.0',
    title: 'Strip',
    category: 'light',
    footprint: { width: 2, depth: 0.02, height: 0.01 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: { finish: 'matte-white' } },
    parts: [{ id: 'body', geometry: { type: 'sphere', radius: 0.05 }, material: 'body' }],
    anchors: [{ kind: 'mount', id: 'mount', mount: 'wall' }, emitter('a', -0.9), emitter('b', 0.9)],
  };
}

describe('floorLighting', () => {
  it('clips a pool to its room so walls stop the light', () => {
    const lighting = floorLighting(input([placement('ceiling', 3.5, 2)], { ceiling: ON }));
    const pool = lighting.rooms[0]?.pools[0];
    expect(pool?.roomId).toBe('kitchen');
    const xs = pool?.clip.flatMap((polygon) => polygon.outer.map((point) => point.x)) ?? [];
    expect(Math.max(...xs)).toBeLessThanOrEqual(4 + 1e-9);
    expect(pooledLightAt(pool === undefined ? [] : [pool], { x: 4.3, y: 2 }).weight).toBe(0);
    expect(
      pooledLightAt(pool === undefined ? [] : [pool], { x: 3.3, y: 2 }).weight,
    ).toBeGreaterThan(0);
  });

  it('merges every pool of a room into one group with no count cap', () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      placement(`l${String(index)}`, 0.5 + (index % 7) * 0.5, 0.5 + Math.floor(index / 7) * 0.5),
    );
    const lighting = floorLighting(
      input(many, Object.fromEntries(many.map((item) => [item.deviceId, ON]))),
    );
    expect(lighting.rooms).toHaveLength(1);
    expect(lighting.rooms[0]?.pools).toHaveLength(40);
    expect(litRoomNames(lighting)).toEqual(['Kitchen']);
  });

  it('keeps a light outside every room as its own unclipped pool', () => {
    const lighting = floorLighting(input([placement('porch', 12, 2)], { porch: ON }));
    expect(lighting.rooms.map((group) => group.id)).toEqual(['device:porch']);
    expect(lighting.rooms[0]?.pools[0]?.clip[0]?.outer.length).toBeGreaterThan(8);
  });

  it('skips lights that are off or at zero brightness and goes to dusk only while on', () => {
    const off = { ...ON, on: false };
    const dim = { ...ON, brightness: 0 };
    const lit = floorLighting(
      input([placement('a', 1, 1), placement('b', 2, 2)], { a: off, b: dim }),
    );
    expect(lit.rooms).toEqual([]);
    expect(lit.dusk).toBe(DUSK);
    const disabled = floorLighting(input([placement('a', 1, 1)], { a: ON }, false));
    expect(disabled.rooms).toEqual([]);
    expect(disabled.glows).toEqual([]);
    expect(disabled.dusk).toBe(DAYLIGHT);
  });

  it('takes the colour first, then the colour temperature, then the model emitter', () => {
    const lights = {
      a: { ...ON, colour: '#00FF00' },
      b: { ...ON, colourTempK: 6500 },
      c: { ...ON, brightness: 0.4 },
    };
    const lighting = floorLighting(
      input([placement('a', 1, 1), placement('b', 2, 2), placement('c', 3, 3)], lights),
    );
    const pools = lighting.rooms.flatMap((group) => group.pools);
    expect(pools.map((pool) => pool.colour)).toEqual([
      '#00FF00',
      kelvinColour(6500),
      kelvinColour(2700),
    ]);
    expect(pools[2]?.strength).toBeCloseTo(0.4);
  });

  it('draws ceiling glows at the room ceiling height and lamps at no glow', () => {
    const lamp = placement('lamp', 6, 2, { mount: 'floor' });
    const lighting = floorLighting(
      input([placement('ceiling', 1, 1), lamp], { ceiling: ON, lamp: ON }),
    );
    expect(lighting.glows).toEqual([
      expect.objectContaining({ deviceId: 'ceiling', heightM: 2.6 }),
    ]);
    const reach = lighting.rooms
      .flatMap((group) => group.pools)
      .map((pool) => [pool.kind, pool.reachM]);
    expect(reach).toEqual([
      ['ceiling', LIGHT_POOL_REACH_M.ceiling],
      ['lamp', LIGHT_POOL_REACH_M.lamp],
    ]);
  });

  it('lays a strip along its wall from the model emitters', () => {
    const facts = lightEmitterFacts('wall', stripSpec());
    expect(facts).toEqual({ kind: 'strip', colour: '#FF0000', lengthM: 2 });
    const strip = placement('strip', 2, 3.9, { mount: 'wall', rotationDeg: 270 });
    const lighting = floorLighting({ ...input([strip], { strip: ON }), emitterOf: () => facts });
    const pool = lighting.rooms[0]?.pools[0];
    expect(pool?.from).toEqual({ x: 1, y: 3.9 });
    expect(pool?.to).toEqual({ x: 3, y: 3.9 });
  });

  it('changes its key only when a light changes', () => {
    const items = [placement('a', 1, 1)];
    const first = floorLighting(input(items, { a: ON }));
    expect(floorLighting(input(items, { a: ON })).key).toBe(first.key);
    expect(floorLighting(input(items, { a: { ...ON, brightness: 0.5 } })).key).not.toBe(first.key);
  });
});
