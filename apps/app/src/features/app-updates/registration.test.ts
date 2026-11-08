import { describe, expect, it } from 'vitest';

describe('the app update registration', () => {
  it('loads with the feature notices and routes app_update to one handler', async () => {
    const { FEATURE_NOTICES } = await import('../../store/live-feature-notices');
    const types = FEATURE_NOTICES.flatMap((handler) => handler.types);
    expect(types.filter((type) => type === 'app_update')).toHaveLength(1);
    expect(new Set(types).size).toBe(types.length);
  });
});
