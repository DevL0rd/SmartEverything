import { randomUUID } from 'node:crypto';
import type { BrowserTarget, ChatPage } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';

const saved = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../../../store/browser-metadata', () => ({
  browserMetadata: (key: string): unknown => saved.get(key),
  setBrowserMetadata: (key: string, value: unknown): void => {
    saved.set(key, value);
  },
}));
vi.mock('expo-crypto', () => ({ randomUUID: (): string => randomUUID() }));
vi.mock('../../../platform/browser-surface', () => ({
  browserCapability: (): { publicBrowsing: boolean } => ({ publicBrowsing: true }),
}));
vi.mock('../../../platform/browser-html-projection', () => ({
  projectPageTarget: (page: ChatPage, id: string): Promise<BrowserTarget> =>
    Promise.resolve({
      kind: 'project',
      id,
      page,
      projectionId: 'a'.repeat(64),
      url: `http://127.0.0.1:53119${page.path}`,
    }),
  releaseProjectTarget: (): Promise<void> => Promise.resolve(),
}));

const { BrowserTabs } = await import('./browser-tabs');
const { persistBrowserTabs, restoreBrowserTabs } = await import('./browser-tab-persistence');

const SERVER = { computerId: '00000000-0000-4000-8000-000000000001', port: 8765 };

async function preview(): Promise<{
  readonly tabs: InstanceType<typeof BrowserTabs>;
  readonly id: ReturnType<InstanceType<typeof BrowserTabs>['blank']>;
  readonly navigate: ReturnType<typeof vi.fn>;
  readonly reload: ReturnType<typeof vi.fn>;
}> {
  const tabs = new BrowserTabs('00000000-0000-4000-8000-000000000002');
  const id = tabs.blank();
  await tabs.openProject(id, '/', SERVER);
  const navigate = vi.fn();
  const reload = vi.fn();
  tabs.attach(id, { navigate, back: vi.fn(), forward: vi.fn(), reload, stop: vi.fn() });
  return { tabs, id, navigate, reload };
}

describe('navigation from a private dev server tab', () => {
  it('reuses the same tab for AI refresh and restores its last committed route', async () => {
    const { tabs, id, reload } = await preview();
    const stop = persistBrowserTabs('route', tabs);
    const route = '/smoke.html?mode=demo#result';
    const selection = tabs.tab(id).selection;
    if (selection === null) throw new Error('The preview did not open.');
    tabs.status(id, {
      ...tabs.tab(id).status,
      url: `http://127.0.0.1:53119${route}`,
      loading: false,
    });
    expect(tabs.tab(id).address).toBe(`localhost:8765${route}`);
    await tabs.perform({ kind: 'open', source: { kind: 'server', server: SERVER } });
    expect(tabs.read().tabs).toHaveLength(1);
    expect(tabs.tab(id).selection).toBe(selection);
    expect(reload).toHaveBeenCalledExactlyOnceWith();
    stop();
    const restored = new BrowserTabs(tabs.chatId);
    restored.restore(restoreBrowserTabs('route'));
    await restored.reload(id);
    expect(restored.tab(id).selection?.target.url).toBe(`http://127.0.0.1:53119${route}`);
  });

  it('navigates a dormant private tab directly to its requested route', async () => {
    const { tabs, id } = await preview();
    const stop = persistBrowserTabs('dormant', tabs);
    tabs.address(id, 'localhost:8765/');
    stop();
    const restored = new BrowserTabs(tabs.chatId);
    restored.restore(restoreBrowserTabs('dormant'));
    await restored.navigate(id, 'http://localhost:8765/updated.html?mode=demo#result');
    expect(restored.tab(id).selection?.target.url).toBe(
      'http://127.0.0.1:53119/updated.html?mode=demo#result',
    );
  });
  it.each([
    'http://localhost:8765/smoke.html?mode=demo#result',
    'http://127.0.0.1:8765/smoke.html?mode=demo#result',
    'localhost:8765/smoke.html?mode=demo#result',
  ])('loads %s through the same private projection', async (address) => {
    const { tabs, id, navigate } = await preview();
    const { selection } = tabs.tab(id);
    await tabs.perform({ kind: 'navigate', tabId: id, address });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      'http://127.0.0.1:53119/smoke.html?mode=demo#result',
    );
    expect(tabs.tab(id).selection).toBe(selection);
    expect(tabs.tab(id).source).toEqual({ kind: 'project', path: '/', server: SERVER });
  });

  it.each([
    'http://localhost:8766/smoke.html',
    'https://localhost:8765/smoke.html',
    'http://localhost.example.com:8765/smoke.html',
  ])('leaves %s on the normal public path', async (address) => {
    const { tabs, id, navigate } = await preview();
    await tabs.perform({ kind: 'navigate', tabId: id, address });
    expect(navigate).not.toHaveBeenCalled();
    expect(tabs.tab(id).source).toEqual({ kind: 'public', url: address });
  });
});

it('refreshes generated HTML on the original mounted tab without opening another projection', async () => {
  const tabs = new BrowserTabs('00000000-0000-4000-8000-000000000002');
  const action = {
    kind: 'open',
    source: { kind: 'project', path: '/workspace/site/index.html' },
  } as const;
  await tabs.perform(action);
  const id = tabs.read().selectedId;
  if (id === null) throw new Error('The preview did not open.');
  const selection = tabs.tab(id).selection;
  const reload = vi.fn();
  tabs.attach(id, { navigate: vi.fn(), back: vi.fn(), forward: vi.fn(), reload, stop: vi.fn() });
  tabs.blank();
  await tabs.perform(action);
  expect(tabs.read().selectedId).toBe(id);
  expect(tabs.read().tabs).toHaveLength(2);
  expect(tabs.tab(id).selection).toBe(selection);
  expect(reload).toHaveBeenCalledExactlyOnceWith();
});
