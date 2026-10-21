import type { EmbeddedBrowserAction } from '@smarteverything/domain';
import { browserCapability } from '../../../platform/browser-surface';
import { isBrowserPageAction, type BrowserPageAction } from './browser-page-control';
import { browserTabAddress } from './browser-tab-address';
import { BrowserTabError } from './browser-tab-errors';
import type { BrowserTab } from './browser-tab-state';
export function assertEmbeddedBrowserAction(
  action: EmbeddedBrowserAction,
  tab: (id: string) => BrowserTab,
): void {
  if (
    !browserCapability().publicBrowsing &&
    !isBrowserPageAction(action) &&
    targetsPublicPage(action, tab)
  )
    throw new BrowserTabError('Websites open in your browser, not here.');
}
function targetsPublicPage(
  action: Exclude<EmbeddedBrowserAction, BrowserPageAction>,
  tab: (id: string) => BrowserTab,
): boolean {
  switch (action.kind) {
    case 'open':
      return action.source.kind === 'public';
    case 'navigate':
      return browserTabAddress(tab(action.tabId), action.address).kind === 'public';
    case 'reload':
      return tab(action.tabId).source.kind === 'public';
    case 'select':
    case 'close':
    case 'reorder':
      return false;
  }
}
