import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { CHAT_PAGE_PATH } from '@smarteverything/domain';
import {
  browserMetadata,
  setBrowserMetadata,
  forgetBrowserMetadataWhere,
} from '../../../store/browser-metadata';
import { jsonText } from '../../../format/json-text';
import {
  BROWSER_TAB_ID,
  BROWSER_TAB_LIMIT,
  EMPTY_BROWSER_STATUS,
  type BrowserTabsSnapshot,
} from './browser-tab-state';
import type { BrowserTabs } from './browser-tabs';

const log = new Logger('app.browser-tabs');
const TABS_KEY = z.tuple([z.string(), z.string(), z.string(), z.string()]);
const SAVED_SOURCE = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('blank') }),
  z.strictObject({ kind: z.literal('public'), url: z.url() }),
  z.strictObject({ kind: z.literal('project'), path: CHAT_PAGE_PATH }),
]);
const SAVED_TABS = z
  .strictObject({
    tabs: z
      .array(
        z.strictObject({
          id: BROWSER_TAB_ID,
          title: z.string(),
          address: z.string(),
          source: SAVED_SOURCE,
        }),
      )
      .max(BROWSER_TAB_LIMIT),
    selectedId: BROWSER_TAB_ID.nullable(),
  })
  .refine(
    (snapshot) =>
      new Set(snapshot.tabs.map((tab) => tab.id)).size === snapshot.tabs.length &&
      (snapshot.selectedId === null || snapshot.tabs.some((tab) => tab.id === snapshot.selectedId)),
  );

export function restoreBrowserTabs(key: string): BrowserTabsSnapshot {
  const value = browserMetadata(key);
  if (value === undefined) return { tabs: [], selectedId: null, problem: null };
  const parsed = SAVED_TABS.safeParse(value);
  if (!parsed.success) {
    log.warn('tabs.saved_refused', { issues: parsed.error.issues.length });
    forgetBrowserMetadataWhere((stored) => stored === key);
    return { tabs: [], selectedId: null, problem: null };
  }
  const saved = parsed.data;
  return {
    selectedId: saved.selectedId,
    problem: null,
    tabs: saved.tabs.map((tab) => ({
      ...tab,
      editing: false,
      status: EMPTY_BROWSER_STATUS,
      problem: null,
      selection: null,
      phase: tab.source.kind === 'blank' ? ('blank' as const) : ('dormant' as const),
    })),
  };
}

export function persistBrowserTabs(key: string, tabs: BrowserTabs): () => void {
  let previous = JSON.stringify(browserMetadata(key));
  return tabs.subscribe(() => {
    const snapshot = tabs.read();
    const saved = {
      selectedId: snapshot.selectedId,
      tabs: snapshot.tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        address: tab.address,
        source: tab.source,
      })),
    };
    const serialized = JSON.stringify(saved);
    if (serialized === previous) return;
    previous = serialized;
    setBrowserMetadata(key, saved);
  });
}

export function browserTabsKey(
  url: string,
  clientId: string,
  profileId: string,
  chatId: string,
): string {
  return JSON.stringify([url, clientId, profileId, chatId]);
}

export function forgetChatBrowserTabs(chatId: string): void {
  forgetBrowserMetadataWhere((key) => {
    const parts = jsonText(key);
    const parsed = parts.ok ? TABS_KEY.safeParse(parts.value) : null;
    return parsed?.success === true && parsed.data[3] === chatId;
  });
}
