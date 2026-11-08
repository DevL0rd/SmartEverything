import type { ModelSpec } from '@smarteverything/domain';
import { DoubleSide, FrontSide } from 'three';
import { describe, expect, it } from 'vitest';
import {
  FINISH_TOKENS,
  finishLook,
  isFinishToken,
  linearColor,
  physicalMaterial,
  resolveMaterial,
} from './materials';

const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 } as const;

function chairSpec(): ModelSpec {
  return {
    schema: 1,
    id: 'cat.test.chair',
    version: '1.0.0',
    title: 'Chair',
    category: 'seating',
    footprint: { width: 0.5, depth: 0.5, height: 0.8 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: {
      frame: { finish: 'oak', roughness: 0.4 },
      seat: { finish: 'knit-fabric' },
      accent: { color: '#ff8800', metalness: 0.5 },
    },
    finishes: {
      walnut: { frame: { finish: 'walnut' } },
      painted: { frame: { color: '#202020' }, seat: { sheen: 0.2 } },
    },
    defaultFinish: 'walnut',
    parts: [
      {
        id: 'seat',
        geometry: { type: 'roundedBox', width: 0.4, height: 0.05, depth: 0.4, radius: 0.01 },
        material: 'seat',
      },
    ],
  };
}

describe('finish tokens', () => {
  it('cover every finish of the style guide', () => {
    expect(Object.keys(FINISH_TOKENS)).toHaveLength(19);
    for (const token of ['matte-white', 'brushed-aluminium', 'clear-glass', 'terracotta']) {
      expect(isFinishToken(token)).toBe(true);
    }
  });

  it('reject an unknown token loudly', () => {
    expect(isFinishToken('glass')).toBe(false);
    expect(() => finishLook('glass')).toThrow('unknown finish token glass');
    expect(isFinishToken('toString')).toBe(false);
  });

  it('give clear glass low opacity and strong reflection, fabric sheen', () => {
    expect(FINISH_TOKENS['clear-glass'].opacity).toBeLessThan(0.3);
    expect(FINISH_TOKENS['clear-glass'].reflection).toBeGreaterThan(1);
    expect(FINISH_TOKENS['knit-fabric'].sheen).toBeGreaterThan(0.5);
  });
});

describe('resolveMaterial', () => {
  it('takes token defaults under the slot fields', () => {
    const frame = resolveMaterial(chairSpec(), 'frame', undefined);
    expect(frame).toEqual({
      slot: 'frame',
      color: FINISH_TOKENS.oak.color,
      roughness: 0.4,
      metalness: 0,
      clearcoat: FINISH_TOKENS.oak.clearcoat,
      sheen: 0,
      opacity: 1,
      reflection: 1,
      pattern: 'wood-grain',
    });
  });

  it('a finish swaps the look but keeps the slot surface fields', () => {
    const frame = resolveMaterial(chairSpec(), 'frame', 'walnut');
    expect(frame.color).toBe(FINISH_TOKENS.walnut.color);
    expect(frame.roughness).toBe(0.4);
  });

  it('a colour override drops the token look and its pattern', () => {
    const frame = resolveMaterial(chairSpec(), 'frame', 'painted');
    expect(frame.color).toBe('#202020');
    expect(frame.pattern).toBeNull();
    expect(frame.roughness).toBe(0.4);
  });

  it('a surface-only override keeps the token look', () => {
    const seat = resolveMaterial(chairSpec(), 'seat', 'painted');
    expect(seat.color).toBe(FINISH_TOKENS['knit-fabric'].color);
    expect(seat.sheen).toBe(0.2);
    expect(seat.pattern).toBe('knit');
  });

  it('plain colours keep their explicit fields', () => {
    const accent = resolveMaterial(chairSpec(), 'accent', 'walnut');
    expect(accent).toMatchObject({ color: '#ff8800', metalness: 0.5, pattern: null });
  });

  it('unknown slots and finishes fail loudly', () => {
    expect(() => resolveMaterial(chairSpec(), 'leg', undefined)).toThrow('no material slot leg');
    expect(() => resolveMaterial(chairSpec(), 'frame', 'gold')).toThrow('no finish gold');
  });
});

describe('physicalMaterial', () => {
  it('builds a MeshPhysicalMaterial from the params', () => {
    const glass = resolveMaterial(
      { ...chairSpec(), materials: { ...chairSpec().materials, seat: { finish: 'clear-glass' } } },
      'seat',
      undefined,
    );
    const material = physicalMaterial(glass, { doubleSided: true, faded: false });
    expect(material.type).toBe('MeshPhysicalMaterial');
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.side).toBe(DoubleSide);
    expect(material.envMapIntensity).toBe(1.8);
    expect(material.transmission).toBe(0);
    material.dispose();
  });

  it('is opaque and front sided by default', () => {
    const material = physicalMaterial(resolveMaterial(chairSpec(), 'seat', undefined), {
      doubleSided: false,
      faded: false,
    });
    expect(material.transparent).toBe(false);
    expect(material.side).toBe(FrontSide);
    expect(material.sheen).toBeGreaterThan(0.5);
    material.dispose();
  });

  it('converts sRGB hex to linear colour', () => {
    const [r, g, b] = linearColor('#808080');
    expect(r).toBeCloseTo(0.2159, 3);
    expect(g).toBe(r);
    expect(b).toBe(r);
  });
});
