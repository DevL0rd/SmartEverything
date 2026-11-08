import type { ModelSpec, ModelSpecGeometry } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { colorMaterial, extrudePath, part, pathBuilder, roundedBox } from '../../src/index';
import { HOUSE_CAMERA, isoFlat, type IsoLayer } from '../../src/project/iso-flat';
import { lampSpec } from '../fixture';

const VIEW = { yaw: 30, pitch: 20, fov: 30, padding: 0.1 } as const;

function specOf(parts: ModelSpec['parts']): ModelSpec {
  return {
    schema: 1,
    id: 'cat.test.iso',
    version: '1.0.0',
    title: 'Iso test',
    category: 'test',
    footprint: { width: 1, depth: 1, height: 1 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: colorMaterial('#808080'), accent: colorMaterial('#C04020') },
    parts,
  };
}

const box = (width: number, height: number, depth: number): ModelSpecGeometry =>
  roundedBox({ width, height, depth, radius: 0 });

function pointsOf(d: string): (readonly [number, number])[] {
  return [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

function centreX(layer: IsoLayer | undefined): number {
  const points = pointsOf(layer?.d ?? '');
  return points.reduce((sum, [x]) => sum + x, 0) / points.length;
}

const ids = (layers: readonly IsoLayer[]): string[] => [
  ...new Set(layers.map((layer) => layer.partId)),
];

describe('isoFlat', () => {
  it('draws the three faces of a box that face the house camera, lit from the top left front', () => {
    const flat = isoFlat(specOf([part('cube', box(1, 1, 1), 'body')]), { theme: 'light' });
    expect(flat.camera).toEqual(HOUSE_CAMERA);
    expect(flat.layers.map((layer) => layer.face)).toEqual(['face', 'face', 'face']);
    const shades = flat.layers.map((layer) => layer.shade).sort((a, b) => b - a);
    expect(shades[0]).toBeCloseTo(0.861, 2);
    expect(shades[1]).toBeCloseTo(0.722, 2);
    expect(shades[2]).toBeCloseTo(0.35, 2);
    expect(new Set(flat.layers.map((layer) => layer.fill)).size).toBe(3);
  });

  it('projects true metres at yaw 30 and pitch 18', () => {
    const flat = isoFlat(specOf([part('cube', box(1, 1, 1), 'body')]), { theme: 'light' });
    expect(flat.bounds.width).toBeCloseTo(Math.cos(Math.PI / 6) + 0.5, 4);
    expect(flat.bounds.height).toBeCloseTo(1.3732, 3);
    const double = isoFlat(specOf([part('cube', box(2, 2, 2), 'body')]), { theme: 'light' });
    expect(double.bounds.width).toBeCloseTo(flat.bounds.width * 2, 4);
  });

  it('mirrors the visible faces when the camera yaw flips', () => {
    const spec = specOf([part('cube', box(1, 1, 1), 'body')]);
    const right = isoFlat(spec, { theme: 'light' })
      .layers.map(centreX)
      .sort((a, b) => a - b);
    const left = isoFlat(spec, { theme: 'light', camera: { yaw: -30, pitch: 18 } })
      .layers.map(centreX)
      .sort((a, b) => a - b);
    expect(right.map((x) => Number(x.toFixed(3)) + 0)).toEqual([-0.25, 0, 0.433]);
    expect(left.map((x) => Number(x.toFixed(3)) + 0)).toEqual([-0.433, 0, 0.25]);
  });

  it('paints far parts before near parts whatever the spec order', () => {
    const spec = specOf([
      part('front', box(1, 1, 1), 'body'),
      part('back', box(1, 1, 1), 'accent', { transform: { position: [0, 0, -2] } }),
      part('lid', box(0.5, 0.2, 0.5), 'accent', { transform: { position: [0, 0.6, 0] } }),
    ]);
    expect(ids(isoFlat(spec, { theme: 'light' }).layers)).toEqual(['back', 'front', 'lid']);
  });

  it('paints a rug under the sofa standing on it even when listed last', () => {
    const rug: ModelSpecGeometry = { type: 'roundedPlane', width: 3, height: 2, radius: 0.05 };
    const spec = specOf([
      part('sofa', box(2, 0.8, 0.9), 'body', { transform: { position: [0, 0.4, -0.4] } }),
      part('rug', rug, 'accent', { transform: { rotation: [-90, 0, 0] } }),
    ]);
    const layers = isoFlat(spec, { theme: 'light' }).layers;
    expect(ids(layers)).toEqual(['rug', 'sofa']);
    expect(layers[0]?.face).toBe('panel');
  });

  it('gives a cylinder its side and only the cap that faces the camera', () => {
    const can: ModelSpecGeometry = {
      type: 'cylinder',
      topRadius: 0.2,
      bottomRadius: 0.2,
      height: 1,
    };
    const layers = isoFlat(specOf([part('can', can, 'body')]), { theme: 'light' }).layers;
    expect(layers.map((layer) => layer.face)).toEqual(['side', 'face']);
    const below = isoFlat(specOf([part('can', can, 'body')]), {
      theme: 'light',
      camera: { yaw: 30, pitch: -18 },
    }).layers;
    expect(below.map((layer) => layer.face)).toEqual(['side', 'face']);
    expect(below[1]?.d).not.toBe(layers[1]?.d);
  });

  it('keeps the hole of a flat ring with the even-odd rule', () => {
    const ring: ModelSpecGeometry = { type: 'ring', innerRadius: 0.2, outerRadius: 0.5 };
    const spec = specOf([part('ring', ring, 'body', { transform: { rotation: [-90, 0, 0] } })]);
    const [layer] = isoFlat(spec, { theme: 'light' }).layers;
    expect(layer?.fillRule).toBe('evenodd');
    expect(layer?.d.split('M')).toHaveLength(3);
  });

  it('sweeps an extrusion into walls and its near cap', () => {
    const shape = pathBuilder(0, 0).line(1, 0).line(1, 0.3).line(0.3, 0.3).line(0.3, 1).line(0, 1);
    const spec = specOf([part('ell', extrudePath(shape.close(), 0.2), 'body')]);
    const layers = isoFlat(spec, { theme: 'light' }).layers;
    expect(layers.map((layer) => [layer.face, layer.fillRule])).toEqual([
      ['side', 'nonzero'],
      ['face', 'evenodd'],
    ]);
  });

  it('colours faces from the finish and reports unresolved tokens', () => {
    const spec = lampSpec();
    const white = isoFlat(spec, { theme: 'light' });
    const graphite = isoFlat(spec, { theme: 'light', finish: 'graphite' });
    const base = (flat: typeof white): string | undefined =>
      flat.layers.find((layer) => layer.partId === 'base')?.fill;
    expect(base(graphite)).not.toBe(base(white));
    expect(white.unresolved).toEqual(['token:glass']);
    expect(isoFlat(spec, { theme: 'light', colors: { glass: '#A0C8E0' } }).unresolved).toEqual([]);
    expect(() => isoFlat(spec, { theme: 'light', finish: 'gold' })).toThrow(/no finish gold/);
  });

  it('follows the level of detail and the theme', () => {
    const spec = lampSpec();
    expect(ids(isoFlat(spec, { theme: 'light' }).layers)).not.toContain('trim');
    expect(ids(isoFlat(spec, { theme: 'light', lod: 2 }).layers)).toContain('trim');
    const dark = isoFlat(spec, { theme: 'dark' }).layers[0]?.fill;
    expect(dark).not.toBe(isoFlat(spec, { theme: 'light' }).layers[0]?.fill);
  });

  it('is pure', () => {
    const spec = lampSpec();
    const copy = structuredClone(spec);
    const first = isoFlat(spec, { theme: 'light', params: { reach: 0.9 } });
    expect(isoFlat(spec, { theme: 'light', params: { reach: 0.9 } })).toEqual(first);
    expect(spec).toEqual(copy);
    expect(first.layers.every((layer) => layer.d.length > 0)).toBe(true);
  });
});
