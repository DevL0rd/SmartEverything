import { statusAddress, projectAddress } from './browser-tab-address';
import type { EmbeddedBrowserTab } from '@smarteverything/domain';
import type { BrowserTabs } from './browser-tabs';
import type { BrowserTab } from './browser-tab-state';
export function embeddedBrowserSnapshot(tabs: BrowserTabs): {
  readonly tabs: readonly EmbeddedBrowserTab[];
  readonly selectedTabId: string | null;
} {
  const snapshot = tabs.read();
  return {
    tabs: snapshot.tabs.map((tab) => embeddedTab(tab, tabs.mounted(tab.id))),
    selectedTabId: snapshot.selectedId,
  };
}
function embeddedTab(tab: BrowserTab, mounted: boolean): EmbeddedBrowserTab {
  return {
    ...(tab.phase === 'ready' && mounted ? { browserId: tab.selection.target.id } : {}),
    tabId: tab.id,
    title: tab.title,
    address: embeddedAddress(tab),
    source: tab.source.kind,
    state: tab.phase === 'dormant' ? 'unavailable' : tab.phase,
    problem: tab.problem ?? tab.status.problem,
    back: tab.status.back,
    forward: tab.status.forward,
    loading: tab.status.loading,
  };
}

function sourceAddress(tab: BrowserTab): string {
  if (tab.source.kind === 'project') return projectAddress(tab.source.path);
  return tab.source.kind === 'public' ? tab.source.url : '';
}

export function embeddedAddress(tab: BrowserTab): string {
  const fallback = sourceAddress(tab);
  return tab.selection === null ? fallback : statusAddress(tab.selection, tab.status.url, fallback);
}
