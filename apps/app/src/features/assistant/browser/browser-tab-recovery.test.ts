import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_PREVIEW_CAPABILITY,
  AI_PREVIEW_CATALOGUE,
  type AiPreviewCatalogue,
  type AiPreviewPublication,
} from '@smarteverything/domain';
import type { BrowserSelection } from './browser-selection';
import type { BrowserTabs } from './browser-tabs';

const mocks = vi.hoisted(() => ({ admitted: 0, down: false }));

vi.mock('expo-crypto', () => ({ randomUUID: (): string => globalThis.crypto.randomUUID() }));
vi.mock('../data/preview-owner', async () => {
  const { ValueStore } = await import('../../../design/external-store');
  return { retiredGatewayLease: new ValueStore<string | null>(null) };
});
vi.mock('../../../queries/preview-notices', async () => {
  const { ValueStore } = await import('../../../design/external-store');
  return { previewNotices: new ValueStore(null) };
});
vi.mock('../../../api/connection/active-route', async () => {
  const { ValueStore } = await import('../../../design/external-store');
  const state = new ValueStore<{ endpoint: object | null; problem: string | null }>({
    endpoint: null,
    problem: null,
  });
  return { routeFor: (): { state: typeof state } => ({ state }) };
});
vi.mock('./browser-diagnostics', () => ({ releasePreviewDiagnostics: vi.fn() }));
vi.mock('./browser-tab-persistence', () => ({
  persistBrowserTabs: (): (() => void) => () => undefined,
  restoreBrowserTabs: (): { tabs: []; selectedId: null; problem: null } => ({
    tabs: [],
    selectedId: null,
    problem: null,
  }),
  forgetChatBrowserTabs: vi.fn(),
}));
vi.mock('./browser-tab-admission', () => ({
  admitBrowserPublication: (
    _chatId: string,
    publication: AiPreviewPublication,
  ): BrowserSelection => {
    mocks.admitted += 1;
    if (mocks.down) throw new Error('The hub is starting.');
    const origin = `https://lease-${String(mocks.admitted)}.example.net`;
    return {
      kind: 'preview',
      publication,
      lease: {
        publication_id: publication.id,
        revision: publication.revision,
        profile_id: publication.profile_id,
        target: publication.target,
        generation: publication.generation,
        url: `${origin}/`,
        origin,
        expires_at: null,
      },
      target: { kind: 'preview', id: origin, url: `${origin}/`, origin, initialPath: '/' },
    };
  },
  retireBrowserSelection: (): Promise<void> => Promise.resolve(),
  retireBrowserSelectionQuietly: vi.fn(),
}));
vi.mock('../../../platform/browser-surface', () => ({
  browserCapability: (): boolean => true,
  gatewayBrowserAvailable: (): boolean => true,
}));
vi.mock('../../../platform/browser-html-projection', () => ({
  nativeHtmlPreviewAvailable: (): boolean => false,
  releaseHtmlTarget: (): Promise<void> => Promise.resolve(),
}));

const ID = '00000000-0000-4000-8000-0000000000';
const PUBLICATION: AiPreviewPublication = {
  id: `${ID}01`,
  revision: `${ID}02`,
  chat_id: `${ID}03`,
  profile_id: `${ID}04`,
  target: { kind: 'device', device_id: `${ID}05` },
  generation: `${ID}06`,
  runtime_instance: `${ID}07`,
  workspace: '/work',
  title: 'App',
  source_origin: 'http://127.0.0.1:3000',
  initial_path: '/',
  expires_at: null,
};
const catalogue = (publications: readonly AiPreviewPublication[]): AiPreviewCatalogue =>
  AI_PREVIEW_CATALOGUE.parse({
    capability: AI_PREVIEW_CAPABILITY,
    publications,
    documents: [],
    gateway: { ready: true, base_domain: null, reason: null },
  });

let workspaceCount = 0;
function openWorkspace(): BrowserTabs {
  workspaceCount += 1;
  const tabs = browserWorkspace(`retirement-${String(workspaceCount)}`, {
    chatId: PUBLICATION.chat_id,
    profileId: PUBLICATION.profile_id,
    clientId: 'client',
    connection: { url: 'https://hub.test', token: `token-${String(workspaceCount)}` },
  });
  tabs.setCatalogue(catalogue([PUBLICATION]));
  return tabs;
}

const { browserWorkspace } = await import('./browser-runtime');
const { followRouteRecovery, recoverUnavailableTabs } = await import('./browser-tab-recovery');
const { routeFor } = await import('../../../api/connection/active-route');
const route = routeFor({ url: 'https://hub.test', token: 'token' }).state;
const ENDPOINT = { kind: 'remote', url: 'https://hub.test' } as const;
const setRoute = (endpoint: typeof ENDPOINT | null, problem: string | null): void => {
  route.set({ ...route.get(), endpoint, problem });
};
const OWNER = { url: 'https://hub.test', token: 'token' };

describe('route recovery of unavailable publication tabs', () => {
  beforeEach(() => {
    mocks.admitted = 0;
    mocks.down = false;
    setRoute(null, null);
  });

  async function unavailableTab(): Promise<BrowserTabs> {
    const tabs = openWorkspace();
    await tabs.openPublication(PUBLICATION);
    mocks.down = true;
    for (const { id } of tabs.read().tabs) await expect(tabs.renew(id)).rejects.toThrow('starting');
    expect(tabs.read().tabs[0]?.phase).toBe('unavailable');
    return tabs;
  }

  it('re-admits only on a healthy route event, not on the tab snapshot or a failing route', async () => {
    const tabs = await unavailableTab();
    const stop = followRouteRecovery(OWNER, () => {
      recoverUnavailableTabs(tabs, catalogue([PUBLICATION]));
    });
    const attempts = mocks.admitted;
    await Promise.resolve();
    expect(mocks.admitted).toBe(attempts);

    setRoute(ENDPOINT, 'unreachable');
    await Promise.resolve();
    expect(mocks.admitted).toBe(attempts);

    mocks.down = false;
    setRoute(ENDPOINT, null);
    await vi.waitFor(() => {
      expect(tabs.read().tabs[0]?.phase).toBe('ready');
    });
    expect(tabs.read().tabs[0]?.problem).toBeNull();
    stop();
  });

  it('leaves tabs whose page is no longer shared unavailable', async () => {
    const tabs = await unavailableTab();
    mocks.down = false;
    const attempts = mocks.admitted;
    recoverUnavailableTabs(tabs, catalogue([]));
    await Promise.resolve();
    expect(mocks.admitted).toBe(attempts);
    expect(tabs.read().tabs[0]?.phase).toBe('unavailable');
  });
});
