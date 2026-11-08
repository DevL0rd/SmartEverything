import { describe, expect, it } from 'vitest';
import { floorLighting } from '../../lighting';
import { floorOf, input, ON, placement, room } from '../../lighting-fixture';
import type { RenderObject, RenderOpening, RenderWall } from '../../render-scene';
import {
  buildProxyMesh,
  CEILING_LIGHT_DROP_M,
  proxyIrradiance,
  proxyLightOf,
  relightLights,
  type ProxyFloor,
  type ProxyMeshData,
} from './proxy-mesh';

const wall: RenderWall = {
  id: 'w1',
  from: { x: 0, y: 0 },
  to: { x: 4, y: 0 },
  thickness: 0.1,
  height: 2.6,
  kind: 'solid',
  exterior: true,
};

function opening(kind: RenderOpening['kind']): RenderOpening {
  return {
    id: `o-${kind}`,
    wallId: 'w1',
    from: { x: 1, y: 0 },
    to: { x: 2, y: 0 },
    kind,
    sourceKind: null,
    sillHeight: kind === 'window' ? 0.9 : 0,
    headHeight: 2.1,
    hinge: 'left',
    swing: 'in',
    contactDeviceId: null,
    lockDeviceId: null,
    roomIds: [],
  };
}

const sofa: RenderObject = {
  id: 'sofa',
  modelId: 'cat.sofa',
  kind: 'cat.sofa',
  label: null,
  finish: null,
  params: { width: 2, depth: 1, height: 0.8 },
  at: { x: 2, y: 2 },
  rotationDeg: 0,
  elevation: 0,
  footprint: null,
  height: null,
  locked: false,
  roomId: 'kitchen',
  wall: null,
};

function proxyFloor(extra: Partial<ProxyFloor> = {}): ProxyFloor {
  return { ...floorOf([]), elevation: 3, walls: [wall], objects: [sofa], ...extra };
}

function heights(data: ProxyMeshData): readonly number[] {
  return Array.from(
    { length: data.positions.length / 3 },
    (_, index) => data.positions[index * 3 + 1] ?? 0,
  );
}

describe('buildProxyMesh', () => {
  it('builds a slab per shown room, walls at their real height and furniture boxes', () => {
    const data = buildProxyMesh(proxyFloor());

    expect(data.slabs).toBe(2);
    expect(data.wallPieces).toBe(1);
    expect(data.boxes).toBe(1);
    expect(Math.min(...heights(data))).toBeCloseTo(3);
    expect(Math.max(...heights(data))).toBeCloseTo(3 + 2.6);
    expect(data.triangles).toBe(data.indices.length / 3);
  });

  it('skips hidden rooms', () => {
    const hidden = { ...room('hall', 'Hall', 4, 8), hidden: true };
    const data = buildProxyMesh(proxyFloor({ rooms: [room('kitchen', 'Kitchen', 0, 4), hidden] }));

    expect(data.slabs).toBe(1);
  });

  it('lets light through window glass and keeps the sill, head and door lintel', () => {
    const windowed = buildProxyMesh(proxyFloor({ openings: [opening('window')], objects: [] }));
    const doored = buildProxyMesh(proxyFloor({ openings: [opening('door')], objects: [] }));

    expect(windowed.wallPieces).toBe(4);
    expect(doored.wallPieces).toBe(3);
  });

  it('stands a furniture box on its footprint at its height', () => {
    const data = buildProxyMesh(proxyFloor({ rooms: [], walls: [] }));
    const axis = (offset: number): number[] =>
      Array.from(
        { length: data.positions.length / 3 },
        (_, i) => data.positions[i * 3 + offset] ?? 0,
      );
    const span = (values: readonly number[]): number => Math.max(...values) - Math.min(...values);

    expect(Math.max(...heights(data))).toBeCloseTo(3.8);
    expect(span(axis(0))).toBeCloseTo(1);
    expect(span(axis(2))).toBeCloseTo(2);
  });
});

describe('relightLights', () => {
  const many = Array.from({ length: 20 }, (_, index) =>
    placement(`lamp-${String(index).padStart(2, '0')}`, 0.2 + index * 0.35, 2),
  );
  const states = Object.fromEntries(
    many.map((item, index) => [item.deviceId, { ...ON, brightness: (index + 1) / 20 }]),
  );

  it('lights the proxy with every light that is on, without a count', () => {
    const lights = relightLights(floorLighting(input(many, states)), 0, 0);

    expect(lights.real).toHaveLength(20);
    expect(lights.decalIds).toHaveLength(0);
    expect(lights.glows).toHaveLength(20);
  });

  it('turns the dimmest lights into decals only by the scaler share, keeping every glow', () => {
    const lights = relightLights(floorLighting(input(many, states)), 0, 0.5);

    expect(lights.real).toHaveLength(10);
    expect(lights.decalIds).toEqual(many.slice(0, 10).map((item) => item.deviceId));
    expect(lights.glows).toHaveLength(20);
  });

  it('is empty while the lights setting is off', () => {
    const lights = relightLights(floorLighting(input(many, states, false)), 0, 0);

    expect(lights.real).toHaveLength(0);
    expect(lights.glows).toHaveLength(0);
  });

  it('hangs a ceiling light under the ceiling and reaches full strength straight below', () => {
    const lighting = floorLighting(input([placement('ceiling', 2, 2)], { ceiling: ON }));
    const pool = lighting.rooms[0]?.pools[0];
    expect(pool).toBeDefined();
    if (pool === undefined) return;
    const light = proxyLightOf(pool, 3);

    expect(light.position[1]).toBeCloseTo(3 + 2.6 - CEILING_LIGHT_DROP_M);
    expect(proxyIrradiance(light, light.nominalM)).toBeCloseTo(1);
    expect(proxyIrradiance(light, light.distance)).toBe(0);
  });
});
