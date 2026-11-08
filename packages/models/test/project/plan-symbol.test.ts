import type { ModelSpec, ModelSpecGeometry } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { colorMaterial, part, pathBuilder, extrudePath, roundedBox } from '../../src/index';
import { mixColor, planSymbol } from '../../src/project/plan-symbol';
import { lampSpec } from '../fixture';

const VIEW = { yaw: 30, pitch: 20, fov: 30, padding: 0.1 } as const;

function specOf(parts: ModelSpec['parts'], extra: Partial<ModelSpec> = {}): ModelSpec {
  return {
    schema: 1,
    id: 'cat.test.plan',
    version: '1.0.0',
    title: 'Plan test',
    category: 'test',
    footprint: { width: 1, depth: 1, height: 1 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: colorMaterial('#808080'), accent: colorMaterial('#C04020') },
    parts,
    ...extra,
  };
}

const box = (width: number, height: number, depth: number): ModelSpecGeometry =>
  roundedBox({ width, height, depth, radius: 0 });

function channelSum(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  return ((value >> 16) & 255) + ((value >> 8) & 255) + (value & 255);
}

function pointsOf(d: string): (readonly [number, number])[] {
  return [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

function close(actual: number, expected: number): void {
  expect(actual).toBeCloseTo(expected, 4);
}

describe('planSymbol', () => {
  it('projects x to x and z to y in true metres', () => {
    const symbol = planSymbol(specOf([part('top', box(1, 0.5, 2), 'body')]), { theme: 'light' });
    expect(symbol.layers).toHaveLength(1);
    close(symbol.bounds.x, -0.5);
    close(symbol.bounds.y, -1);
    close(symbol.bounds.width, 1);
    close(symbol.bounds.height, 2);
    close(symbol.layers[0]?.top ?? 0, 0.25);
  });

  it('applies rotation and parent transforms', () => {
    const spec = specOf([
      part('base', box(2, 0.1, 1), 'body', { transform: { rotation: [0, 90, 0] } }),
      part('cap', box(0.2, 0.1, 0.2), 'accent', {
        parent: 'base',
        transform: { position: [0.5, 0.1, 0] },
      }),
    ]);
    const symbol = planSymbol(spec, { theme: 'light' });
    close(symbol.bounds.width, 1);
    close(symbol.bounds.height, 2);
    const cap = symbol.layers.find((layer) => layer.partId === 'cap');
    const points = pointsOf(cap?.d ?? '');
    close(Math.min(...points.map(([x]) => x)), -0.1);
    close(Math.max(...points.map(([, y]) => y)), -0.4);
  });

  it('sorts layers by top height and shades higher parts lighter', () => {
    const spec = specOf([
      part('tall', box(0.2, 1, 0.2), 'body', { transform: { position: [0, 0.5, 0] } }),
      part('low', box(1, 0.1, 1), 'body', { transform: { position: [0, 0.05, 0] } }),
    ]);
    const symbol = planSymbol(spec, { theme: 'light' });
    expect(symbol.layers.map((layer) => layer.partId)).toEqual(['low', 'tall']);
    const [low, tall] = symbol.layers;
    expect(channelSum(tall?.fill ?? '#000000')).toBeGreaterThan(channelSum(low?.fill ?? '#FFFFFF'));
  });

  it('outlines each layer one pixel darker than its fill', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const layer of planSymbol(lampSpec(), { theme }).layers) {
        expect(channelSum(layer.stroke)).toBeLessThan(channelSum(layer.fill));
        expect(layer.strokeWidth).toBe(1);
        expect(layer.vectorEffect).toBe('non-scaling-stroke');
      }
    }
  });

  it('keeps the true outline of flat parts lying down and hulls them when tilted', () => {
    const ring = { type: 'ring', innerRadius: 0.2, outerRadius: 0.4, segments: 16 } as const;
    const lying = planSymbol(
      specOf([part('ring', ring, 'body', { transform: { rotation: [-90, 0, 0] } })]),
      { theme: 'light' },
    ).layers[0];
    expect(lying?.fillRule).toBe('evenodd');
    expect(lying?.d.match(/M/g)).toHaveLength(2);
    const tilted = specOf([part('ring', ring, 'body', { transform: { rotation: [-45, 0, 0] } })]);
    const standing = planSymbol(tilted, { theme: 'light' }).layers[0];
    expect(standing?.fillRule).toBe('nonzero');
    expect(standing?.d.match(/M/g)).toHaveLength(1);
  });

  it('keeps a concave extruded shape concave when it lies flat', () => {
    const shape = pathBuilder(0, 0).line(1, 0).line(1, 0.3).line(0.3, 0.3).line(0.3, 1).line(0, 1);
    const spec = specOf([
      part('ell', extrudePath(shape.close(), 0.05), 'body', {
        transform: { rotation: [90, 0, 0] },
      }),
    ]);
    const layer = planSymbol(spec, { theme: 'light' }).layers[0];
    expect(layer?.d.split('L')).toHaveLength(6);
    expect(layer?.d).toContain('0.3 0.3');
  });

  it('drops parts above the map level of detail and their children', () => {
    const spec = specOf([
      part('body', box(0.5, 0.5, 0.5), 'body'),
      part('micro', box(0.1, 0.1, 0.1), 'accent', { minLod: 2 }),
      part('child', box(0.05, 0.05, 0.05), 'accent', { parent: 'micro' }),
    ]);
    expect(planSymbol(spec, { theme: 'light' }).layers.map((layer) => layer.partId)).toEqual([
      'body',
    ]);
  });

  it('resolves params with clamping to the declared range', () => {
    const spec = specOf(
      [
        part(
          'top',
          roundedBox({ width: { param: 'w' }, height: 0.1, depth: 1, radius: 0 }),
          'body',
        ),
      ],
      {
        params: { w: { min: 0.5, max: 2, default: 1, unit: 'm' } },
      },
    );
    close(planSymbol(spec, { theme: 'light' }).bounds.width, 1);
    close(planSymbol(spec, { theme: 'light', params: { w: 1.5 } }).bounds.width, 1.5);
    close(planSymbol(spec, { theme: 'light', params: { w: 9 } }).bounds.width, 2);
  });

  it('applies finishes and token colours, and reports what it cannot resolve', () => {
    const spec = specOf(
      [part('top', box(1, 0.1, 1), 'body'), part('glass', box(0.5, 0.2, 0.5), 'glass')],
      {
        materials: {
          body: colorMaterial('#808080'),
          glass: { finish: 'frosted-glass', opacity: 0.6 },
        },
        finishes: { black: { body: colorMaterial('#101010') } },
        defaultFinish: 'black',
      },
    );
    const plain = planSymbol(spec, { theme: 'light' });
    expect(plain.unresolved).toEqual(['token:frosted-glass']);
    const colored = planSymbol(spec, { theme: 'light', colors: { 'frosted-glass': '#EEF2F4' } });
    expect(colored.unresolved).toEqual([]);
    const [body, glass] = colored.layers;
    expect(channelSum(body?.fill ?? '#FFFFFF')).toBeLessThan(channelSum('#404040'));
    expect(glass?.fillOpacity).toBe(0.6);
    const stale = planSymbol(spec, {
      theme: 'light',
      finish: 'oak',
      colors: { 'frosted-glass': '#EEF2F4' },
    });
    expect(stale.unresolved).toEqual(['finish:oak']);
    expect(stale.layers).toEqual(colored.layers);
  });

  it('is pure: the same input gives the same output and the spec is not changed', () => {
    const spec = lampSpec();
    const before = JSON.stringify(spec);
    const first = planSymbol(spec, { theme: 'dark', finish: 'graphite' });
    expect(planSymbol(spec, { theme: 'dark', finish: 'graphite' })).toEqual(first);
    expect(JSON.stringify(spec)).toBe(before);
    expect(planSymbol(spec, { theme: 'light', finish: 'graphite' })).not.toEqual(first);
  });

  it('mixes colours linearly per channel', () => {
    expect(mixColor('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixColor('#123456', '#000000', 0)).toBe('#123456');
  });
});
