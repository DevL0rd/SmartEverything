import { describe, expect, it } from 'vitest';

describe('the treadmill picture modules', () => {
  it('load and export the visual', async () => {
    const module = await import('../treadmill-visual');
    expect(typeof module.TreadmillVisual).toBe('function');
  });
});
