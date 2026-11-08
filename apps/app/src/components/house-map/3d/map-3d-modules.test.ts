import { describe, expect, it } from 'vitest';

describe('map 3d modules', () => {
  it('load without a browser or a device', async () => {
    const dom = await import('./map-3d');
    expect(typeof dom.default).toBe('function');
  });
});
