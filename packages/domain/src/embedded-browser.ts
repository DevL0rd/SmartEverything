import { z } from 'zod';
import {
  BROWSER_PAGE,
  BROWSER_PAGE_ACTION_NAMES,
  BROWSER_PAGE_CLICK,
  BROWSER_PAGE_KEYS,
  BROWSER_PAGE_SCROLL,
  BROWSER_PAGE_TYPE,
} from './browser-page';

export const EMBEDDED_BROWSER_PROTOCOL = 'smarteverything.embedded-browser.v1';
export const EMBEDDED_BROWSER_PATH = '/api/embedded-browser';
export const EMBEDDED_BROWSER_MAX_TABS = 16;
export const EMBEDDED_BROWSER_ACTION_NAMES = [
  'open',
  'select',
  'navigate',
  'reload',
  'close',
  'reorder',
  ...BROWSER_PAGE_ACTION_NAMES,
] as const;
const TAB_ID = z.uuid();
export const EMBEDDED_BROWSER_ACTION = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('open'),
    source: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('public'), url: z.url().max(8192) }),
      z.strictObject({ kind: z.literal('publication'), publicationId: z.uuid() }),
    ]),
  }),
  z.strictObject({ kind: z.literal('select'), tabId: TAB_ID }),
  z.strictObject({ kind: z.literal('reload'), tabId: TAB_ID }),
  z.strictObject({ kind: z.literal('close'), tabId: TAB_ID }),
  z.strictObject({
    kind: z.literal('navigate'),
    tabId: TAB_ID,
    address: z.string().min(1).max(8192),
  }),
  z.strictObject({
    kind: z.literal('reorder'),
    tabIds: z.array(TAB_ID).max(EMBEDDED_BROWSER_MAX_TABS),
  }),
  z.strictObject({ kind: z.literal('back'), tabId: TAB_ID }),
  z.strictObject({ kind: z.literal('forward'), tabId: TAB_ID }),
  BROWSER_PAGE_CLICK.extend({ tabId: TAB_ID }),
  BROWSER_PAGE_TYPE.extend({ tabId: TAB_ID }),
  BROWSER_PAGE_KEYS.extend({ tabId: TAB_ID }),
  BROWSER_PAGE_SCROLL.extend({ tabId: TAB_ID }),
]);
export type EmbeddedBrowserAction = z.infer<typeof EMBEDDED_BROWSER_ACTION>;
export const EMBEDDED_BROWSER_SCOPE = z.strictObject({
  viewerId: z.uuid(),
  generation: z.uuid(),
  clientId: z.string().min(1).max(512),
  profileId: z.uuid(),
  chatId: z.uuid(),
});
export type EmbeddedBrowserScope = z.infer<typeof EMBEDDED_BROWSER_SCOPE>;
export const EMBEDDED_BROWSER_TAB = z.strictObject({
  tabId: TAB_ID,
  browserId: z.string().min(1).max(512).optional(),
  title: z.string().max(512),
  address: z.string().max(8192),
  source: z.enum(['blank', 'public', 'service', 'html']),
  publicationId: z.uuid().nullable(),
  state: z.enum(['blank', 'opening', 'ready', 'unavailable']),
  problem: z.string().max(4096).nullable(),
  back: z.boolean(),
  forward: z.boolean(),
  loading: z.boolean(),
});
export type EmbeddedBrowserTab = z.infer<typeof EMBEDDED_BROWSER_TAB>;
export const EMBEDDED_BROWSER_CONTENT = z.strictObject({
  selectedTabId: TAB_ID.nullable(),
  tabs: z.array(EMBEDDED_BROWSER_TAB).max(EMBEDDED_BROWSER_MAX_TABS),
});
export const EMBEDDED_BROWSER_SNAPSHOT = EMBEDDED_BROWSER_SCOPE.extend({
  ...EMBEDDED_BROWSER_CONTENT.shape,
  capabilities: z
    .array(z.enum(EMBEDDED_BROWSER_ACTION_NAMES))
    .max(EMBEDDED_BROWSER_ACTION_NAMES.length)
    .optional(),
  page: BROWSER_PAGE.optional(),
});
export type EmbeddedBrowserSnapshot = z.infer<typeof EMBEDDED_BROWSER_SNAPSHOT>;
export const EMBEDDED_BROWSER_SELECTOR = z.strictObject({
  viewerId: z.uuid().optional(),
  clientId: z.string().min(1).max(512).optional(),
});
export const EMBEDDED_BROWSER_VIEWS = ['tabs', 'page'] as const;
export const EMBEDDED_BROWSER_READ = EMBEDDED_BROWSER_SELECTOR.extend({
  view: z.enum(EMBEDDED_BROWSER_VIEWS).default('tabs'),
  tabId: TAB_ID.optional(),
});
export const EMBEDDED_BROWSER_EDIT = EMBEDDED_BROWSER_SELECTOR.extend({
  requestId: z.uuid(),
  action: EMBEDDED_BROWSER_ACTION,
});
export const EMBEDDED_BROWSER_OPERATION = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('read'),
    view: z.enum(EMBEDDED_BROWSER_VIEWS).default('tabs'),
    tabId: TAB_ID.optional(),
  }),
  z.strictObject({ kind: z.literal('edit'), action: EMBEDDED_BROWSER_ACTION }),
]);
export const EMBEDDED_BROWSER_REQUEST = z.strictObject({
  requestId: z.uuid(),
  scope: EMBEDDED_BROWSER_SCOPE,
  operation: EMBEDDED_BROWSER_OPERATION,
});
export type EmbeddedBrowserRequest = z.infer<typeof EMBEDDED_BROWSER_REQUEST>;
export const EMBEDDED_BROWSER_RESULT = z.strictObject({
  snapshot: EMBEDDED_BROWSER_SNAPSHOT,
  tabId: TAB_ID.nullable(),
});
export type EmbeddedBrowserResult = z.infer<typeof EMBEDDED_BROWSER_RESULT>;
export const EMBEDDED_BROWSER_MESSAGE = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('register'), scope: EMBEDDED_BROWSER_SCOPE }),
  z.strictObject({
    kind: z.literal('result'),
    request: EMBEDDED_BROWSER_REQUEST,
    result: EMBEDDED_BROWSER_RESULT.nullable(),
    reason: z.string().min(1).max(4096).nullable(),
  }),
]);
export const EMBEDDED_BROWSER_RESPONSE = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('accepted'), scope: EMBEDDED_BROWSER_SCOPE }),
  z.strictObject({ kind: z.literal('perform'), request: EMBEDDED_BROWSER_REQUEST }),
  z.strictObject({ kind: z.literal('cancel'), requestId: z.uuid() }),
  z.strictObject({ kind: z.literal('refused'), reason: z.string().min(1).max(4096) }),
]);
