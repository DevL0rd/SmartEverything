import type { AiPreviewCatalogue } from '@smarteverything/domain';
import { assertEmbeddedBrowserAction } from './browser-embedded-policy';
import { BrowserTabError } from './browser-tab-errors';
import { browserPublications } from './browser-publications';
import type { BrowserTabs } from './browser-tabs';
import type { BrowserTab, BrowserTabsAction } from './browser-tab-state';

export async function performBrowserTabAction(
  tabs: BrowserTabs,
  action: BrowserTabsAction,
  catalogue: AiPreviewCatalogue | undefined,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted === true) throw new BrowserTabError('The browser command was cancelled.');
  assertEmbeddedBrowserAction(action, { tab: (id): BrowserTab => tabs.tab(id), catalogue });
  switch (action.kind) {
    case 'open':
      return openBrowserTab(tabs, action.source, catalogue, signal);
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
      return tabs.close(action.tabId);
    case 'reorder':
      tabs.reorder(action.tabIds);
      return;
  }
}

async function openBrowserTab(
  tabs: BrowserTabs,
  source: Extract<BrowserTabsAction, { kind: 'open' }>['source'],
  catalogue: AiPreviewCatalogue | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (source.kind === 'public') {
    const id = tabs.blank();
    return tabs.guardAdmission(id, () => tabs.navigate(id, source.url), signal);
  }
  const publication = browserPublications(catalogue).find((row) => row.id === source.publicationId);
  if (publication === undefined)
    throw new BrowserTabError('This page is not shared with the current chat.');
  const existing = tabs
    .read()
    .tabs.find(
      (tab) => tab.source.kind === 'publication' && tab.source.publication.id === publication.id,
    );
  const id = existing?.id ?? tabs.blank();
  return tabs.guardAdmission(id, () => tabs.openPublication(publication, id), signal);
}
