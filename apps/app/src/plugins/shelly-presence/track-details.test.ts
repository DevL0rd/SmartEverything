import { describe, expect, it } from 'vitest';
import { trackFields } from './track-details';

describe('trackFields', () => {
  it('names the vendor fields without inventing units', () => {
    const text = trackFields({ id: 1, x: 1.234, y: -0.5, z: 0.9, minz: 0.1, maxz: 1.7 });
    expect(text).toBe('x 1.2 · y -0.5 · z 0.9 · minz 0.1 · maxz 1.7');
    expect(text).not.toMatch(/\bm\b|metre|meter|min z|max z/);
  });

  it('leaves out the optional fields the sensor did not send', () => {
    expect(trackFields({ id: 2, x: 0, y: 1, z: 2 })).toBe('x 0.0 · y 1.0 · z 2.0');
  });
});
