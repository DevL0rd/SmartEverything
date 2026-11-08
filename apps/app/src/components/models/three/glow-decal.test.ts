import { AdditiveBlending } from 'three';
import { describe, expect, it } from 'vitest';
import { createGlowDecalFactory, GLOW_PEAK_OPACITY, glowPixels, glowStrength } from './glow-decal';

function alphaAt(size: number, data: Uint8Array, column: number, row: number): number {
  return data[(row * size + column) * 4 + 3] ?? -1;
}

describe('glow decal', () => {
  it('draws a white radial falloff that is brightest in the middle and clear at the corners', () => {
    const { size, data } = glowPixels(16);
    expect(alphaAt(size, data, 8, 8)).toBeGreaterThan(200);
    expect(alphaAt(size, data, 0, 0)).toBe(0);
    expect(alphaAt(size, data, 12, 8)).toBeLessThan(alphaAt(size, data, 9, 8));
    expect([...data.slice(0, 3)]).toEqual([255, 255, 255]);
  });

  it('grows with brightness and never reaches full strength', () => {
    expect(glowStrength(0)).toBe(0);
    expect(glowStrength(-1)).toBe(0);
    expect(glowStrength(1)).toBeCloseTo(0.5);
    expect(glowStrength(4)).toBeGreaterThan(glowStrength(1));
    expect(glowStrength(1000)).toBeLessThan(1);
  });

  it('is an additive decal tinted by the light colour and scaled by brightness', () => {
    const factory = createGlowDecalFactory();
    const floor = factory.create('floor', 'lamp:glow-floor');
    const wall = factory.create('wall', 'lamp:glow-wall');
    expect(floor.mesh.material.blending).toBe(AdditiveBlending);
    expect(floor.mesh.material.depthWrite).toBe(false);
    expect(floor.mesh.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(wall.mesh.rotation.x).toBe(0);
    expect(floor.mesh.geometry).toBe(wall.mesh.geometry);
    expect(floor.mesh.visible).toBe(false);
    floor.apply({ color: '#FF8800', intensity: 1, spreadM: 0.5 });
    expect(floor.mesh.visible).toBe(true);
    expect(floor.mesh.material.color.getHexString()).toBe('ff8800');
    expect(floor.mesh.material.opacity).toBeCloseTo(0.5 * GLOW_PEAK_OPACITY);
    const dim = floor.mesh.scale.x;
    floor.apply({ color: '#FF8800', intensity: 9, spreadM: 0.5 });
    expect(floor.mesh.material.opacity).toBeCloseTo(0.9 * GLOW_PEAK_OPACITY);
    expect(floor.mesh.scale.x).toBeGreaterThan(dim);
    floor.apply({ color: '#FF8800', intensity: 0, spreadM: 0.5 });
    expect(floor.mesh.visible).toBe(false);
    floor.apply(null);
    expect(floor.mesh.visible).toBe(false);
    floor.dispose();
    wall.dispose();
    factory.dispose();
  });
});
