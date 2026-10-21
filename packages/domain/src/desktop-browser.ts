import type { NativeBrowserPage } from './browser-page';
import { z } from 'zod';
import { CHAT_PAGE, NATIVE_HTML_PROJECTION } from './chat-pages';
export * from './chat-pages';
export * from './embedded-browser';
export * from './browser-page';
export * from './browser-page-script';
export * from './browser-page-driver';

export const BROWSER_RETIRED_PROBLEM =
  'This page was closed. Reload to open it again.';
const BROWSER_ID = z.string().min(1).max(512);

export class BrowserPolicyError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'BrowserPolicyError';
  }
}

export const BROWSER_TARGET = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('public'),
    id: BROWSER_ID,
    url: z.url(),
    profileId: z.uuid().optional(),
  }),
  z.strictObject({
    kind: z.literal('project'),
    id: BROWSER_ID,
    url: NATIVE_HTML_PROJECTION.shape.url,
    projectionId: NATIVE_HTML_PROJECTION.shape.id,
    page: CHAT_PAGE,
  }),
]);
export type BrowserTarget = z.infer<typeof BROWSER_TARGET>;
export const BROWSER_STATUS = z.strictObject({
  id: BROWSER_ID,
  url: z.string(),
  loading: z.boolean(),
  back: z.boolean(),
  forward: z.boolean(),
  problem: z.string().nullable(),
});
export type BrowserStatus = z.infer<typeof BROWSER_STATUS>;
export const BROWSER_WINDOW_REQUEST = z.strictObject({ id: BROWSER_ID, url: z.url() });
export type BrowserWindowRequest = z.infer<typeof BROWSER_WINDOW_REQUEST>;
export const BROWSER_COMMAND = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('open'), target: BROWSER_TARGET }),
  z.strictObject({ kind: z.literal('navigate'), id: BROWSER_ID, url: z.url() }),
  z.strictObject({
    kind: z.literal('action'),
    id: BROWSER_ID,
    action: z.enum(['back', 'forward', 'reload', 'stop', 'destroy']),
  }),
  z.strictObject({
    kind: z.literal('layout'),
    id: BROWSER_ID,
    visible: z.boolean(),
    bounds: z.strictObject({
      x: z.number().int().min(0),
      y: z.number().int().min(0),
      width: z.number().int().min(0).max(16000),
      height: z.number().int().min(0).max(16000),
    }),
  }),
]);
export type BrowserCommand = z.infer<typeof BROWSER_COMMAND>;
export interface DesktopBrowser {
  readonly page?: NativeBrowserPage;
  command(command: BrowserCommand): Promise<void>;
  subscribe(listener: (status: BrowserStatus) => void): () => void;
  subscribeWindowRequests(listener: (request: BrowserWindowRequest) => void): () => void;
}

const PRIVATE_HOST_SUFFIXES = ['localhost', 'local', 'internal', 'test', 'invalid', 'home'];
function publicHost(host: string): boolean {
  return (
    host.includes('.') &&
    !/^[0-9.]+$/.test(host) &&
    !host.includes(':') &&
    !PRIVATE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  );
}
export function browsableUrl(value: string): boolean {
  const parsed = z.url().safeParse(value);
  if (!parsed.success) return false;
  const url = new URL(parsed.data);
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    url.username === '' &&
    url.password === ''
  );
}
export function publicBrowserUrl(value: string): boolean {
  return browsableUrl(value) && publicHost(new URL(value).hostname.toLowerCase());
}
export function browserAllows(target: BrowserTarget, value: string): boolean {
  if (target.kind === 'public') return browsableUrl(value);
  const parsed = z.url().safeParse(value);
  if (!parsed.success) return false;
  const url = new URL(parsed.data);
  const origin = new URL(target.url);
  return (
    url.protocol === origin.protocol &&
    url.host === origin.host &&
    url.username === '' &&
    url.password === ''
  );
}
