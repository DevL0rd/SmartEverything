import { describe, expect, it } from 'vitest';
import { mergeMeasured, sceneSizes } from './scene-sizes';

describe('scene sizes', () => {
  const base = new Map([
    ['a', { w: 248, h: 100 }],
    ['b', { w: 212, h: 60 }],
  ]);

  it('takes a measured size over the metrics and keeps the rest', () => {
    const sizes = sceneSizes(base, new Map([['a', { w: 248, h: 180 }]]));
    expect(sizes.get('a')).toEqual({ w: 248, h: 180 });
    expect(sizes.get('b')).toEqual({ w: 212, h: 60 });
    expect(sceneSizes(base, undefined)).toBe(base);
  });

  it('keeps the same map when nothing changed so the scene is not rebuilt', () => {
    const known = new Map([['a', { w: 248, h: 180 }]]);
    expect(mergeMeasured(known, [{ id: 'a', w: 248, h: 180 }])).toBe(known);
    expect(mergeMeasured(known, [{ id: 'a', w: 248, h: 190 }]).get('a')).toEqual({
      w: 248,
      h: 190,
    });
  });
});
