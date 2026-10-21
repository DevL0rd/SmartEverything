import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({ randomUUID: (): string => globalThis.crypto.randomUUID() }));
vi.mock('./browser-tab-persistence', () => ({
  persistBrowserTabs: (): (() => void) => () => undefined,
  restoreBrowserTabs: (): { tabs: []; selectedId: null; problem: null } => ({
    tabs: [],
    selectedId: null,
    problem: null,
  }),
  forgetChatBrowserTabs: vi.fn(),
}));
vi.mock('../../../platform/browser-surface', () => ({
  browserCapability: (): boolean => true,
}));
vi.mock('../../../platform/browser-html-projection', () => ({
  releaseProjectTarget: (): Promise<void> => Promise.resolve(),
}));

const { browserWorkspace, retainBrowserAuthority } = await import('./browser-runtime');

const OWNER = {
  chatId: '00000000-0000-4000-8000-000000000011',
  profileId: '00000000-0000-4000-8000-000000000012',
  clientId: 'client',
};

describe('the browser viewer keeps one identity for the life of its pane', () => {
  it('returns the same viewer when the chat thread mounts or renders again', () => {
    const connection = { url: 'https://hub.test', token: 'token-a' };
    const mounted = browserWorkspace('identity-remount', { ...OWNER, connection });
    const remounted = browserWorkspace('identity-remount', { ...OWNER, connection });
    expect(remounted).toBe(mounted);
    expect(remounted.viewerId).toBe(mounted.viewerId);
  });

  it('keeps the viewer when the same pairing is read back as a new object', () => {
    const before = browserWorkspace('identity-refresh', {
      ...OWNER,
      connection: { url: 'https://hub.test', token: 'token-b' },
    });
    const after = browserWorkspace('identity-refresh', {
      ...OWNER,
      connection: { url: 'https://hub.test', token: 'token-b' },
    });
    expect(after.viewerId).toBe(before.viewerId);
  });

  it('starts a new viewer only when the device pairs again', () => {
    const before = browserWorkspace('identity-repair', {
      ...OWNER,
      connection: { url: 'https://hub.test', token: 'token-c' },
    });
    const after = browserWorkspace('identity-repair', {
      ...OWNER,
      connection: { url: 'https://hub.test', token: 'token-d' },
    });
    expect(after.viewerId).not.toBe(before.viewerId);
  });

  it('survives an authority check that still matches the paired client', () => {
    const connection = { url: 'https://hub.test', token: 'token-e' };
    const before = browserWorkspace('identity-authority', { ...OWNER, connection });
    retainBrowserAuthority(connection, OWNER.profileId, OWNER.clientId);
    const after = browserWorkspace('identity-authority', { ...OWNER, connection });
    expect(after.viewerId).toBe(before.viewerId);
  });
});
