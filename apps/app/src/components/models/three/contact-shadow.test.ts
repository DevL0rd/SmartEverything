import type { ModelSpec } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { buildModel } from './build-model';
import {
  contactFootprint,
  createContactShadow,
  SHADOW_LIFT,
  SHADOW_SPREAD,
  shadowPixels,
  shadowRect,
} from './contact-shadow';

const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 } as const;

function boxSpec(contact: boolean): ModelSpec {
  return {
    schema: 1,
    id: 'dev.test.box',
    version: '1.0.0',
    title: 'Box',
    category: 'test',
    footprint: { width: 0.4, depth: 0.2, height: 0.6 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: { finish: 'matte-white' } },
    parts: [
      {
        id: 'body',
        geometry: {
          type: 'roundedBox',
          width: 0.4,
          height: 0.6,
          depth: 0.2,
          radius: 0.02,
          segments: 3,
        },
        material: 'body',
        transform: { position: [0.1, 0.3, 0] },
        contact,
      },
      {
        id: 'top',
        parent: 'body',
        geometry: { type: 'sphere', radius: 0.05 },
        material: 'body',
        transform: { position: [0, 0.35, 0] },
      },
    ],
  };
}

function alphaAt(pixels: ReturnType<typeof shadowPixels>, column: number, row: number): number {
  return pixels.data[(row * pixels.width + column) * 4 + 3] ?? -1;
}

describe('contact shadow', () => {
  it('takes the footprint from the contact parts only', () => {
    const footprint = contactFootprint(buildModel(boxSpec(true), { lod: 1 }));
    expect(footprint?.minX).toBeCloseTo(-0.1);
    expect(footprint?.maxX).toBeCloseTo(0.3);
    expect(footprint?.minZ).toBeCloseTo(-0.1);
    expect(footprint?.maxZ).toBeCloseTo(0.1);
    expect(footprint?.floorY).toBeCloseTo(0);
  });

  it('casts no shadow for a model without contact parts', () => {
    expect(createContactShadow(buildModel(boxSpec(false), { lod: 1 }), 'light')).toBeNull();
  });

  it('spreads the plane past the footprint by the blur margin', () => {
    const rect = shadowRect({ minX: -0.2, maxX: 0.2, minZ: -0.1, maxZ: 0.1, floorY: 0 });
    expect(rect.width).toBeCloseTo(0.4 + 0.4 * SHADOW_SPREAD * 2);
    expect(rect.depth).toBeCloseTo(0.2 + 0.4 * SHADOW_SPREAD * 2);
  });

  it('is dark under the footprint, clear at the edge and symmetric', () => {
    const rect = shadowRect({ minX: -0.2, maxX: 0.2, minZ: -0.1, maxZ: 0.1, floorY: 0 });
    const pixels = shadowPixels(rect, 64);
    expect(pixels.width).toBe(64);
    expect(pixels.height).toBeLessThan(pixels.width);
    const midRow = Math.floor(pixels.height / 2);
    expect(alphaAt(pixels, 32, midRow)).toBeGreaterThan(240);
    expect(alphaAt(pixels, 0, 0)).toBe(0);
    expect(alphaAt(pixels, 0, midRow)).toBeLessThan(10);
    expect(alphaAt(pixels, 10, midRow)).toBe(alphaAt(pixels, 53, midRow));
    expect(pixels.data[0]).toBe(0);
  });

  it('lies flat on the floor with the theme opacity and no shadow maps', () => {
    const model = buildModel(boxSpec(true), { lod: 2 });
    const shadow = createContactShadow(model, 'light');
    expect(shadow).not.toBeNull();
    if (shadow === null) return;
    expect(shadow.mesh.material.opacity).toBe(0.35);
    expect(shadow.mesh.material.depthWrite).toBe(false);
    expect(shadow.mesh.castShadow).toBe(false);
    expect(shadow.mesh.position.y).toBeCloseTo(SHADOW_LIFT);
    expect(shadow.mesh.position.x).toBeCloseTo(0.1);
    expect(shadow.pixels.width).toBe(128);
    shadow.mesh.geometry.computeBoundingBox();
    const box = shadow.mesh.geometry.boundingBox;
    expect((box?.max.y ?? 1) - (box?.min.y ?? 0)).toBeCloseTo(0);
    shadow.setTheme('dark');
    expect(shadow.mesh.material.opacity).toBe(0.55);
    model.group.add(shadow.mesh);
    shadow.dispose();
    expect(shadow.mesh.parent).toBeNull();
  });
});
