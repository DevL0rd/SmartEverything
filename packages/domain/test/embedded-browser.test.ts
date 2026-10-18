import { describe, expect, it } from 'vitest';
import { EMBEDDED_BROWSER_RESULT } from '../src';

const SCOPE = {
  viewerId: '00000000-0000-4000-8000-000000000001',
  generation: '00000000-0000-4000-8000-000000000002',
  clientId: 'client',
  profileId: '00000000-0000-4000-8000-000000000003',
  chatId: '00000000-0000-4000-8000-000000000004',
};

describe('EMBEDDED_BROWSER_RESULT', () => {
  it('accepts a snapshot without a capabilities list', () => {
    const result = EMBEDDED_BROWSER_RESULT.safeParse({
      snapshot: { ...SCOPE, selectedTabId: null, tabs: [] },
      tabId: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a snapshot that still carries the capabilities list of an older peer', () => {
    const result = EMBEDDED_BROWSER_RESULT.safeParse({
      snapshot: { ...SCOPE, selectedTabId: null, tabs: [], capabilities: ['open', 'reorder'] },
      tabId: null,
    });
    expect(result.success).toBe(true);
  });

  it('refuses a capabilities entry that is not a known action', () => {
    const result = EMBEDDED_BROWSER_RESULT.safeParse({
      snapshot: { ...SCOPE, selectedTabId: null, tabs: [], capabilities: ['teleport'] },
      tabId: null,
    });
    expect(result.success).toBe(false);
  });
});
