import {
  BROWSER_PAGE,
  BROWSER_PAGE_ACTION_NAMES,
  BROWSER_PAGE_NOTICE,
  type BrowserPage,
  type NativeBrowserPage,
  type EmbeddedBrowserAction,
} from '@smarteverything/domain';
import { embeddedAddress } from './browser-embedded-snapshot';
import { previewDiagnosticsNative } from './browser-diagnostics-platform';
import { BrowserTabError } from './browser-tab-errors';
import type { BrowserTabs } from './browser-tabs';
import type { BrowserTab } from './browser-tab-state';

type BrowserPageOperationAction = Extract<
  EmbeddedBrowserAction,
  { kind: 'click' | 'type' | 'keys' | 'scroll' }
>;

export type BrowserPageAction =
  BrowserPageOperationAction | Extract<EmbeddedBrowserAction, { kind: 'back' | 'forward' }>;

const PAGE_ACTION_NAMES: ReadonlySet<string> = new Set(BROWSER_PAGE_ACTION_NAMES);

export function isBrowserPageActionName(name: string): boolean {
  return PAGE_ACTION_NAMES.has(name);
}

export function isBrowserPageAction(action: EmbeddedBrowserAction): action is BrowserPageAction {
  return PAGE_ACTION_NAMES.has(action.kind);
}

export function browserPageSupported(): boolean {
  return previewDiagnosticsNative('public')?.page !== undefined;
}

function pageOf(
  tab: BrowserTab,
  selectedId: string | null,
): { readonly page: NativeBrowserPage; readonly id: string } {
  if (tab.phase !== 'ready')
    throw new BrowserTabError('This tab has no page open yet. Wait for it to finish opening.');
  if (tab.id !== selectedId)
    throw new BrowserTabError('Select this tab first so its page is showing, then try again.');
  const page = previewDiagnosticsNative(tab.selection.target.kind)?.page;
  if (page === undefined)
    throw new BrowserTabError('This device cannot read or act on a page in the browser.');
  return { page, id: tab.selection.target.id };
}

export async function readBrowserPage(
  tab: BrowserTab,
  selectedId: string | null,
): Promise<BrowserPage> {
  const { page, id } = pageOf(tab, selectedId);
  const reading = await page.perform({ id, operation: { kind: 'snapshot' } });
  if (reading === null) throw new BrowserTabError('The page did not answer with a reading.');
  return BROWSER_PAGE.parse({
    notice: BROWSER_PAGE_NOTICE,
    tabId: tab.id,
    address: embeddedAddress(tab),
    generation: reading.generation,
    title: reading.title,
    text: reading.text,
    textTruncated: reading.textTruncated,
    elements: reading.elements,
    elementsTruncated: reading.elementsTruncated,
  });
}

async function actOnBrowserPage(
  tab: BrowserTab,
  selectedId: string | null,
  action: BrowserPageOperationAction,
): Promise<void> {
  const { page, id } = pageOf(tab, selectedId);
  const { tabId: _tabId, ...operation } = action;
  await page.perform({ id, operation });
}

export function performBrowserPageAction(
  tabs: Pick<BrowserTabs, 'tab' | 'read' | 'handle'>,
  action: BrowserPageAction,
): Promise<void> {
  const tab = tabs.tab(action.tabId);
  if (action.kind === 'back') {
    tabs.handle(tab.id).back();
    return Promise.resolve();
  }
  if (action.kind === 'forward') {
    tabs.handle(tab.id).forward();
    return Promise.resolve();
  }
  return actOnBrowserPage(tab, tabs.read().selectedId, action);
}
