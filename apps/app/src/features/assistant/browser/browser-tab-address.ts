import type { BrowserSelection, BrowserPublication } from './browser-selection';
import { isHtmlPublication } from './browser-selection';
import type { AiPreviewPublication } from '@smarteverything/domain';
import type { BrowserTab } from './browser-tab-state';
import {
  browserAddress,
  displayPreviewAddress,
  type AddressReach,
  type BrowserAddress,
} from './browser-address';
export function publicationAddress(publication: BrowserPublication): string {
  return isHtmlPublication(publication)
    ? publication.title
    : displayPreviewAddress(publication, '');
}
export function statusAddress(selection: BrowserSelection, url: string, current: string): string {
  if (url === '' || url.includes('/.se-preview/bootstrap')) return current;
  if (selection.kind === 'preview') return displayPreviewAddress(selection.publication, url);
  return selection.kind === 'html' ? selection.publication.title : url;
}

export function browserTabAddress(
  tab: BrowserTab,
  address: string,
  publications: readonly AiPreviewPublication[],
  reach: AddressReach,
): BrowserAddress | { readonly kind: 'document' } {
  if (
    tab.source.kind === 'publication' &&
    isHtmlPublication(tab.source.publication) &&
    address.trim() === publicationAddress(tab.source.publication).trim()
  )
    return { kind: 'document' };
  return browserAddress(
    address,
    tab.selection?.kind === 'preview' ? tab.selection.publication : null,
    publications,
    reach,
  );
}

export function publicAddressTab(tab: BrowserTab, url: string): BrowserTab {
  return {
    ...tab,
    source: { kind: 'public', url },
    title: new URL(url).hostname,
    address: url,
    editing: false,
    problem: null,
  };
}
