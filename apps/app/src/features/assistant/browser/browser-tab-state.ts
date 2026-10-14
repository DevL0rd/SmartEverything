import { z } from 'zod';
import type { BrowserStatus, EmbeddedBrowserAction } from '@smarteverything/domain';
import type { BrowserPublication, BrowserSelection } from './browser-selection';

export const BROWSER_TAB_ID = z.uuid().brand<'BrowserTabId'>();
export type BrowserTabId = z.infer<typeof BROWSER_TAB_ID>;
export const BROWSER_TAB_LIMIT = 16;
export const EMPTY_BROWSER_STATUS: BrowserStatus = {
  id: '',
  url: '',
  loading: false,
  back: false,
  forward: false,
  problem: null,
};
export type BrowserTabSource =
  | { readonly kind: 'blank' }
  | { readonly kind: 'public'; readonly url: string }
  | { readonly kind: 'publication'; readonly publication: BrowserPublication };
interface BrowserTabBase {
  readonly id: BrowserTabId;
  readonly title: string;
  readonly address: string;
  readonly editing: boolean;
  readonly status: BrowserStatus;
  readonly source: BrowserTabSource;
  readonly problem: string | null;
}
export type BrowserTab = BrowserTabBase &
  (
    | { readonly phase: 'blank' | 'dormant' | 'opening' | 'unavailable'; readonly selection: null }
    | { readonly phase: 'ready'; readonly selection: BrowserSelection }
  );
export interface BrowserTabsSnapshot {
  readonly tabs: readonly BrowserTab[];
  readonly selectedId: BrowserTabId | null;
  readonly problem: string | null;
}
export type BrowserTabsAction = EmbeddedBrowserAction;
export function closedTabSelection(snapshot: BrowserTabsSnapshot, id: string): BrowserTabId | null {
  if (snapshot.selectedId !== id) return snapshot.selectedId;
  const index = snapshot.tabs.findIndex((tab) => tab.id === id);
  return snapshot.tabs[index + 1]?.id ?? snapshot.tabs[index - 1]?.id ?? null;
}
export function shiftedTabs(
  order: readonly string[],
  id: string,
  offset: -1 | 1,
): readonly string[] {
  const from = order.indexOf(id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const result = [...order];
  result.splice(from, 1);
  result.splice(to, 0, id);
  return result;
}
export function insertedTabs(
  order: readonly string[],
  id: string,
  before: string | null,
): readonly string[] {
  const rest = order.filter((entry) => entry !== id);
  const index = before === null ? rest.length : rest.indexOf(before);
  if (!order.includes(id) || index < 0) return order;
  return [...rest.slice(0, index), id, ...rest.slice(index)];
}
