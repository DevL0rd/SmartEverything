import { describe, expect, it } from 'vitest';

describe('pinned home map modules', () => {
  it('load for the devices page', async () => {
    const [map, split, body] = await Promise.all([
      import('./pinned-map'),
      import('./pinned-split'),
      import('./pinned-body'),
    ]);
    expect(typeof map.PinnedMap).toBe('function');
    expect(typeof split.PinnedSplit).toBe('function');
    expect(typeof body.PinnedBody).toBe('function');
  });
});
