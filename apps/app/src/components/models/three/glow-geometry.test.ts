import type { ModelSpec } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { buildGeometry, lodSegments, triangleCount } from './geometry';
import { glowFalloff, glowGeometry, glowRings } from './glow-geometry';
import { physicalMaterial, resolveMaterial } from './materials';

describe('glow geometry', () => {
  it('fades smoothly from a full centre to nothing at the rim', () => {
    expect(glowFalloff(0)).toBe(1);
    expect(glowFalloff(1)).toBe(0);
    const samples = Array.from({ length: 101 }, (_, index) => glowFalloff(index / 100));
    for (const [index, value] of samples.entries()) {
      const next = samples[index + 1];
      if (next !== undefined) expect(next).toBeLessThanOrEqual(value);
      if (next !== undefined) expect(value - next).toBeLessThan(0.04);
    }
  });

  it('carries the fade as vertex alpha across many rings inside its ellipse', () => {
    const geometry = glowGeometry({ width: 0.8, height: 0.4, around: 48 });
    const colour = geometry.getAttribute('color');
    const position = geometry.getAttribute('position');
    expect(colour.itemSize).toBe(4);
    expect(glowRings(48)).toBeGreaterThanOrEqual(12);
    for (let at = 0; at < position.count; at += 1) {
      const x = position.getX(at) / 0.4;
      const y = position.getY(at) / 0.2;
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(1 + 1e-6);
      expect(colour.getW(at)).toBeCloseTo(glowFalloff(Math.hypot(x, y)));
    }
    geometry.dispose();
  });

  it('fans a centre and stitches ring bands at every level of detail', () => {
    const spec = { type: 'glow', width: 0.6, height: 0.4 } as const;
    for (const lod of [0, 1, 2] as const) {
      const geometry = buildGeometry(spec, lod);
      const around = lodSegments(48, lod, 8);
      expect(triangleCount(geometry)).toBe(around * (2 * glowRings(around) - 1));
      geometry.dispose();
    }
  });

  it('builds a see-through, vertex faded material', () => {
    const spec: ModelSpec = {
      schema: 1,
      id: 'dev.test.glow',
      version: '1.0.0',
      title: 'Glow',
      category: 'test',
      footprint: { width: 1, depth: 1, height: 1 },
      framing: {
        tile: { yaw: 0, pitch: 0, fov: 28, padding: 0.1 },
        card: { yaw: 0, pitch: 0, fov: 28, padding: 0.1 },
        hero: { yaw: 0, pitch: 0, fov: 28, padding: 0.1 },
      },
      materials: { accent: { color: '#4F8BFF' } },
      parts: [],
    };
    const material = physicalMaterial(resolveMaterial(spec, 'accent', undefined), {
      doubleSided: true,
      faded: true,
    });
    expect(material.vertexColors).toBe(true);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    material.dispose();
  });
});
