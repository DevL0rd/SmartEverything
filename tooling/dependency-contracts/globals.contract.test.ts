import { describe, expect, it } from 'vitest';
import globals from 'globals';

describe('globals contract', () => {
  it('provides the node global set the lint config uses', () => {
    expect(globals.node).toBeDefined();
    expect(Object.keys(globals.node).length).toBeGreaterThan(0);
    expect(globals.node).toHaveProperty('process');
  });
});
