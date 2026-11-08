import { AmbientLight, DirectionalLight, Object3D, PointLight, type Group } from 'three';
import { describe, expect, it } from 'vitest';
import { DAYLIGHT, DUSK, floorLighting, type FloorLighting } from '../lighting';
import { input, ON, placement } from '../lighting-fixture';
import {
  CEILING_GLOW_DROP_M,
  createDuskRig,
  createLightPoolLayer,
  applySplit,
  rasterRoomPools,
  splitLights,
  type GlowDecal,
  type GlowDecalFactory,
  type GlowLook,
} from './light-pools';

const looks = new Map<string, GlowLook | null>();

function decals(): GlowDecalFactory {
  return {
    create: (_surface, name): GlowDecal => {
      const mesh = new Object3D();
      mesh.name = name;
      return {
        mesh,
        apply: (look): void => {
          looks.set(name, look);
        },
        dispose: (): void => {
          mesh.removeFromParent();
        },
      };
    },
    dispose: (): void => {
      looks.clear();
    },
  };
}

const named = (group: Group, prefix: string): readonly Object3D[] =>
  group.children.filter((child) => child.name.startsWith(prefix));

function lit(count: number): FloorLighting {
  const items = Array.from({ length: count }, (_, index) =>
    placement(`l${String(index)}`, 0.5 + (index % 7) * 0.5, 0.5 + Math.floor(index / 7) * 0.5),
  );
  const hall = placement('hall', 6, 2, { mount: 'floor' });
  const lights = Object.fromEntries([...items, hall].map((item) => [item.deviceId, ON]));
  return floorLighting(input([...items, hall], lights));
}

const ON_COLOUR = lit(1).glows[0]?.colour;

describe('3d light pool layer', () => {
  it('merges any number of pools into one decal per room', () => {
    const layer = createLightPoolLayer(decals);
    expect(layer.update({ lighting: lit(40), elevation: 0, realDeviceIds: new Set() })).toBe(true);
    expect(named(layer.group, 'light-pool:').map((mesh) => mesh.name)).toEqual([
      'light-pool:hall',
      'light-pool:kitchen',
    ]);
    layer.dispose();
  });

  it('draws every ceiling emitter glow at its ceiling height', () => {
    const layer = createLightPoolLayer(decals);
    layer.update({ lighting: lit(40), elevation: 3, realDeviceIds: new Set() });
    const glows = named(layer.group, 'ceiling-glow:');
    expect(glows).toHaveLength(40);
    expect(looks.get('ceiling-glow:l0')).toEqual(expect.objectContaining({ color: ON_COLOUR }));
    expect(glows[0]?.position.y).toBeCloseTo(3 + 2.6 - CEILING_GLOW_DROP_M);
    layer.dispose();
    expect(layer.group.children).toHaveLength(0);
  });

  it('leaves real lights out of the decal and rebuilds only on a change', () => {
    const layer = createLightPoolLayer(decals);
    const lighting = lit(1);
    const real = new Set(['hall']);
    expect(layer.update({ lighting, elevation: 0, realDeviceIds: real })).toBe(true);
    expect(named(layer.group, 'light-pool:').map((mesh) => mesh.name)).toEqual([
      'light-pool:kitchen',
    ]);
    expect(layer.update({ lighting, elevation: 0, realDeviceIds: new Set(['hall']) })).toBe(false);
    expect(layer.update({ lighting, elevation: 0, realDeviceIds: new Set() })).toBe(true);
    expect(named(layer.group, 'light-pool:')).toHaveLength(2);
    layer.dispose();
  });

  it('turns a share of the real lights into decals and gives them back when the share drops', () => {
    const devices = ['c', 'a', 'b', 'd'].map((deviceId) => ({
      deviceId,
      lights: [new PointLight(0xffffff, 1)],
    }));
    const all = [...devices, { deviceId: 'none', lights: [] }];
    const none = splitLights(all, 0);
    expect([...none.real].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(none.decal.size).toBe(0);
    expect(applySplit(all, none)).toBe(false);
    const half = splitLights(all, 0.5);
    expect([...half.decal]).toEqual(['a', 'b']);
    expect([...half.real]).toEqual(['c', 'd']);
    expect(applySplit(all, half)).toBe(true);
    expect(devices.map(({ deviceId, lights }) => [deviceId, lights[0]?.visible])).toEqual([
      ['c', true],
      ['a', false],
      ['b', false],
      ['d', true],
    ]);
    expect(splitLights(all, 0.1).decal).toEqual(new Set(['a']));
    expect(splitLights(all, 1).real.size).toBe(0);
    expect(applySplit(all, none)).toBe(true);
    expect(devices.every(({ lights }) => lights[0]?.visible === true)).toBe(true);
  });

  it('rasters only inside the room clip', () => {
    const lighting = lit(1);
    const room = lighting.rooms.find((group) => group.id === 'kitchen');
    const raster = rasterRoomPools(room?.pools ?? [], { minX: 0, minY: 0, maxX: 8, maxY: 4 }, 2);
    const alphaAt = (x: number, y: number): number =>
      raster.data[(Math.floor(y * 2) * raster.width + Math.floor(x * 2)) * 4 + 3] ?? -1;
    expect(alphaAt(0.6, 0.6)).toBeGreaterThan(0);
    expect(alphaAt(6, 2)).toBe(0);
  });
});

describe('dusk rig', () => {
  it('dims the scene while lighting is on and restores daylight', () => {
    const sun = new DirectionalLight('#ffffff', 2);
    const sky = new AmbientLight('#ffffff', 1);
    const rig = createDuskRig([sun, sky]);
    rig.apply(DUSK);
    expect(sun.intensity).toBeCloseTo(2 * DUSK.sunScale);
    expect(sky.intensity).toBeCloseTo(DUSK.ambientScale);
    rig.apply(DAYLIGHT);
    expect(sun.intensity).toBe(2);
    expect(sky.color.getHexString()).toBe('ffffff');
  });
});
