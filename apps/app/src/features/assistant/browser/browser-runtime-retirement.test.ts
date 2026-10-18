import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_PREVIEW_CAPABILITY,
  AI_PREVIEW_CATALOGUE,
  type AiPreviewCatalogue,
  type AiPreviewPublication,
} from '@smarteverything/domain';
import type { BrowserSelection } from './browser-selection';
import type { BrowserTabs } from './browser-tabs';

const mocks = vi.hoisted(() => ({ admitted: 0 }));

vi.mock('expo-crypto', () => ({ randomUUID: (): string => globalThis.crypto.randomUUID() }));
vi.mock('../data/preview-owner', async () => {
  const { ValueStore } = await import('../../../design/external-store');
  return { retiredGatewayLease: new ValueStore<string | null>(null) };
});
vi.mock('../../../queries/preview-notices', async () => {
  const { ValueStore } = await import('../../../design/external-store');
  return { previewNotices: new ValueStore(null) };
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

const { followGatewayRetirements, browserWorkspace } = await import('./browser-runtime');
const { retiredGatewayLease } = await import('../data/preview-owner');

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

describe('gateway owner retirement', () => {
  beforeEach(() => {
    mocks.admitted = 0;
    retiredGatewayLease.set(null);
  });

  it('re-admits an open preview when its owner socket closes and the page is still shared', async () => {
    const tabs = openWorkspace();
    const stop = followGatewayRetirements();
    await tabs.openPublication(PUBLICATION);
    const first = tabs.read().tabs[0]?.selection;
    expect(first?.target.id).toBe('https://lease-1.example.net');

    retiredGatewayLease.set('https://lease-1.example.net');

    await vi.waitFor(() => {
      const tab = tabs.read().tabs[0];
      expect(tab?.phase).toBe('ready');
      expect(tab?.selection?.target.id).toBe('https://lease-2.example.net');
    });
    expect(tabs.read().tabs[0]?.problem).toBeNull();
    stop();
  });

  it('leaves tabs on other leases alone', async () => {
    const tabs = openWorkspace();
    const stop = followGatewayRetirements();
    await tabs.openPublication(PUBLICATION);

    retiredGatewayLease.set('https://elsewhere.example.net');

    await Promise.resolve();
    expect(mocks.admitted).toBe(1);
    stop();
  });
});
