import { describe, expect, it } from 'vitest';
import { growHeight } from './stream-grow';

describe('growHeight', () => {
  it('holds the measured height only while smoothing', () => {
    expect(growHeight(true, 96)).toBe(96);
    expect(growHeight(true, null)).toBeNull();
    expect(growHeight(false, 96)).toBeNull();
  });
});
