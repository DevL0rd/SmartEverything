import type { EmbeddedBrowserAction } from '@smarteverything/domain';
import { assertEmbeddedBrowserAction } from './browser-embedded-policy';
import { BrowserTabError } from './browser-tab-errors';
import { isBrowserPageAction, performBrowserPageAction } from './browser-page-control';
import type { BrowserTabs } from './browser-tabs';
import type { BrowserTab } from './browser-tab-state';

export async function performBrowserTabAction(
  tabs: BrowserTabs,
  action: EmbeddedBrowserAction,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted === true) throw new BrowserTabError('The browser command was cancelled.');
  assertEmbeddedBrowserAction(action, (id): BrowserTab => tabs.tab(id));
  if (isBrowserPageAction(action)) return performBrowserPageAction(tabs, action);
  switch (action.kind) {
    case 'open':
      return openBrowserTab(tabs, action.source, signal);
    case 'select':
      tabs.select(action.tabId);
      return;
    case 'navigate':
      return tabs.guardAdmission(
        tabs.tab(action.tabId).id,
        () => tabs.navigate(action.tabId, action.address),
        signal,
      );
    case 'reload':
      return tabs.guardAdmission(
        tabs.tab(action.tabId).id,
        () => tabs.reload(action.tabId),
        signal,
      );
    case 'close':
      return closeBrowserTab(tabs, action.tabId);
    case 'reorder':
      tabs.reorder(action.tabIds);
      return;
  }
}

function openBrowserTab(
  tabs: BrowserTabs,
  source: Extract<EmbeddedBrowserAction, { kind: 'open' }>['source'],
  signal: AbortSignal | undefined,
): Promise<void> {
  if (source.kind === 'public') {
    const id = tabs.blank();
    return tabs.guardAdmission(id, () => tabs.navigate(id, source.url), signal);
  }
  const id = tabs.projectTab(source.path) ?? tabs.blank();
  return tabs.guardAdmission(id, () => tabs.openProject(id, source.path), signal);
}

function closeBrowserTab(tabs: BrowserTabs, id: string): Promise<void> {
  return tabs.read().tabs.some((tab) => tab.id === id) ? tabs.close(id) : Promise.resolve();
}
