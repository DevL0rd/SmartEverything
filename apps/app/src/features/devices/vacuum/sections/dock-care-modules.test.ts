import { describe, expect, it } from 'vitest';

describe('dock and care modules', () => {
  it('load without a browser or a device', async () => {
    const dock = await import('./dock');
    const care = await import('./care');
    expect(typeof dock.VacuumDock).toBe('function');
    expect(typeof care.VacuumCare).toBe('function');
  });
});
