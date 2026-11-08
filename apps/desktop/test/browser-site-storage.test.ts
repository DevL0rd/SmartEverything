import { BROWSER_TARGET, BrowserPolicyError } from '@smarteverything/domain';
import { expect, it, vi } from 'vitest';
import { clearBrowserSiteStorage } from '../src/browser-site-storage.js';

const ORIGIN = 'https://garden.fixture.example';
const PAGE = ORIGIN + '/preview';
const TARGET = BROWSER_TARGET.parse({ kind: 'public', id: 'preview', url: PAGE });

it('clears only the currently displayed origin and leaves cookies intact', async () => {
  const session = { clearStorageData: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) };
  await clearBrowserSiteStorage(TARGET, PAGE, ORIGIN, session);
  expect(session.clearStorageData).toHaveBeenCalledExactlyOnceWith({
    origin: ORIGIN,
    storages: ['filesystem', 'indexdb', 'localstorage', 'serviceworkers', 'cachestorage'],
  });
});

it('refuses to clear storage after the tab moves to another site', () => {
  const session = { clearStorageData: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) };
  expect(() =>
    clearBrowserSiteStorage(TARGET, 'https://another.fixture.example', ORIGIN, session),
  ).toThrow(BrowserPolicyError);
  expect(session.clearStorageData).not.toHaveBeenCalled();
});
