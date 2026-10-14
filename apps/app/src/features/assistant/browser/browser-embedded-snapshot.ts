import { statusAddress, publicationAddress } from './browser-tab-address';
import type { EmbeddedBrowserTab } from '@smarteverything/domain';
import type { BrowserTabs } from './browser-tabs';
import type { BrowserTab } from './browser-tab-state';
export function embeddedBrowserSnapshot(tabs: BrowserTabs): {
  readonly tabs: readonly EmbeddedBrowserTab[];
  readonly selectedTabId: string | null;
} {
  const snapshot = tabs.read();
  return { tabs: snapshot.tabs.map(embeddedTab), selectedTabId: snapshot.selectedId };
}
function embeddedTab(tab: BrowserTab): EmbeddedBrowserTab {
  const source = tab.source;
  return {
    ...(tab.phase === 'ready' ? { browserId: tab.selection.target.id } : {}),
    tabId: tab.id,
    title: tab.title,
    address: embeddedAddress(tab),
    source:
      source.kind === 'publication'
        ? 'kind' in source.publication
          ? 'html'
          : 'service'
        : source.kind,
    publicationId: source.kind === 'publication' ? source.publication.id : null,
    state: tab.phase === 'dormant' ? 'unavailable' : tab.phase,
    problem: tab.problem ?? tab.status.problem,
    back: tab.status.back,
    forward: tab.status.forward,
    loading: tab.status.loading,
  };
}

function embeddedAddress(tab: BrowserTab): string {
  if (tab.selection !== null)
    return statusAddress(
      tab.selection,
      tab.status.url,
      tab.source.kind === 'publication'
        ? publicationAddress(tab.source.publication)
        : tab.source.kind === 'public'
          ? tab.source.url
          : '',
    );
  if (tab.source.kind === 'publication') return publicationAddress(tab.source.publication);
  return tab.source.kind === 'public' ? tab.source.url : '';
}
