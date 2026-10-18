import type { AiPreviewCatalogue, EmbeddedBrowserAction } from '@smarteverything/domain';
import { browserCapability } from '../../../platform/browser-surface';
import { browserAddress } from './browser-address';
import { browserTabAddress } from './browser-tab-address';
import { BrowserTabError } from './browser-tab-errors';
import type { BrowserTab } from './browser-tab-state';
interface EmbeddedActionContext {
  readonly tab: (id: string) => BrowserTab;
  readonly catalogue: AiPreviewCatalogue | undefined;
}
export function assertEmbeddedBrowserAction(
  action: EmbeddedBrowserAction,
  context: EmbeddedActionContext,
): void {
  if (!browserCapability().publicBrowsing && targetsPublicPage(action, context))
    throw new BrowserTabError('Public websites open in your browser, not here.');
}
function targetsPublicPage(action: EmbeddedBrowserAction, context: EmbeddedActionContext): boolean {
  const publications = context.catalogue?.publications ?? [];
  switch (action.kind) {
    case 'open':
      return (
        action.source.kind === 'public' &&
        browserAddress(action.source.url, null, publications, 'public-hosts').kind === 'public'
      );
    case 'navigate':
      return (
        browserTabAddress(context.tab(action.tabId), action.address, publications, 'public-hosts')
          .kind === 'public'
      );
    case 'reload':
      return context.tab(action.tabId).source.kind === 'public';
    case 'select':
    case 'close':
    case 'reorder':
      return false;
  }
}
