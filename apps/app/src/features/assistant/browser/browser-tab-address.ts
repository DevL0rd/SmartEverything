import {
  browserAllows,
  SERVER_PAGE_PATH,
  type ChatPage,
  type ChatServer,
} from '@smarteverything/domain';
import type { BrowserSelection } from './browser-selection';
import type { BrowserTab } from './browser-tab-state';
import { browserAddress, type BrowserAddress } from './browser-address';

const HTTP_DEFAULT_PORT = 80;

export function projectAddress(path: string, server?: ChatServer): string {
  if (server !== undefined) return `localhost:${String(server.port)}${path}`;
  return path.replace(/^\/+/u, '');
}
export function pageServer(page: ChatPage): ChatServer | undefined {
  return 'server' in page ? page.server : undefined;
}
export function statusAddress(selection: BrowserSelection, url: string, current: string): string {
  if (url === '') return current;
  if (selection.kind === 'project') {
    const server = pageServer(selection.page);
    const parsed = new URL(url);
    return projectAddress(server === undefined ? parsed.pathname : serverRoute(parsed), server);
  }
  return url;
}

export function serverRoute(url: URL): string {
  return url.pathname + url.search + url.hash;
}

export function committedBrowserSource(tab: BrowserTab, url: string): BrowserTab['source'] {
  if (tab.selection === null || !browserAllows(tab.selection.target, url)) return tab.source;
  if (tab.selection.kind === 'public') return { kind: 'public', url };
  const server = pageServer(tab.selection.page);
  if (server === undefined) return tab.source;
  const path = SERVER_PAGE_PATH.safeParse(serverRoute(new URL(url)));
  return path.success ? { kind: 'project', server, path: path.data } : tab.source;
}
export function browserTabAddress(
  tab: BrowserTab,
  address: string,
): BrowserAddress | { readonly kind: 'document' } | { readonly kind: 'server'; readonly url: URL } {
  const typed = address.trim();
  if (tab.source.kind === 'project') {
    if (typed === projectAddress(tab.source.path, tab.source.server)) return { kind: 'document' };
    if (tab.source.server !== undefined) {
      const url = matchingServerAddress(typed, tab.source.server.port);
      if (url !== null) return { kind: 'server', url };
    }
  }
  return browserAddress(address);
}

function matchingServerAddress(address: string, port: number): URL | null {
  const parsed = browserAddress(address.includes('://') ? address : `http://${address}`);
  if (parsed.kind !== 'public') return null;
  const url = new URL(parsed.url);
  return url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
    (url.port === '' ? HTTP_DEFAULT_PORT : Number(url.port)) === port
    ? url
    : null;
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
