import { describe, expect, it } from 'vitest';

describe('planner data layer', () => {
  it('loads with its notice handlers registered once each', async () => {
    const data = await import('./index');
    const types = data.PLANNER_NOTICES.flatMap((handler) => handler.types);
    expect(types.sort()).toEqual(['planner_ring', 'planner_summary']);
  });
});
