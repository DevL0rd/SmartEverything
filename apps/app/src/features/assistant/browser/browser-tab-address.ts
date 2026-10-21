import type { BrowserSelection } from './browser-selection';
import type { BrowserTab } from './browser-tab-state';
import { browserAddress, type BrowserAddress } from './browser-address';
export function projectAddress(path: string): string {
  return path.replace(/^\/+/u, '');
}
export function statusAddress(selection: BrowserSelection, url: string, current: string): string {
  if (url === '') return current;
  if (selection.kind === 'project') return projectAddress(new URL(url).pathname);
  return url;
}
export function browserTabAddress(
  tab: BrowserTab,
  address: string,
): BrowserAddress | { readonly kind: 'document' } {
  if (tab.source.kind === 'project' && address.trim() === projectAddress(tab.source.path))
    return { kind: 'document' };
  return browserAddress(address);
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
