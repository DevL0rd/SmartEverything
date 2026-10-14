import type { NativeBrowserDiagnostics } from './browser-diagnostics';
import { z } from 'zod';
import { NATIVE_HTML_PROJECTION, NATIVE_PAGE_DESCRIPTOR } from './native-html-preview';
export * from './native-html-preview';
export * from './browser-diagnostics';
export * from './embedded-browser';

export const BROWSER_RETIRED_PROBLEM =
  'The browser page ownership was withdrawn. Reload to request current access.';
const BROWSER_ID = z.string().min(1).max(512);

export class BrowserPolicyError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'BrowserPolicyError';
  }
}

export const BROWSER_TARGET = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('preview'),
    id: BROWSER_ID,
    url: z.url(),
    origin: z.url(),
    initialPath: z.string().regex(/^\/(?!\/)/),
    page: NATIVE_PAGE_DESCRIPTOR.optional(),
    profileId: z.uuid().optional(),
  }),
  z.strictObject({
    kind: z.literal('public'),
    id: BROWSER_ID,
    url: z.url(),
    profileId: z.uuid().optional(),
  }),
  z.strictObject({
    kind: z.literal('native-html'),
    id: BROWSER_ID,
    url: NATIVE_HTML_PROJECTION.shape.url,
    projectionId: NATIVE_HTML_PROJECTION.shape.id,
    project: NATIVE_HTML_PROJECTION.shape.project,
    profileId: z.uuid().optional(),
    page: NATIVE_PAGE_DESCRIPTOR.optional(),
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
  readonly publicSessionVersion?: () => number;
  readonly diagnostics?: NativeBrowserDiagnostics;
  command(command: BrowserCommand): Promise<void>;
  subscribe(listener: (status: BrowserStatus) => void): () => void;
}

function publicHost(host: string): boolean {
  const denied = ['localhost', 'local', 'internal', 'test', 'invalid', 'home'];
  return (
    host.includes('.') &&
    !/^[0-9.]+$/.test(host) &&
    !host.includes(':') &&
    !denied.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  );
}
export function publicBrowserUrl(value: string): boolean {
  const parsed = z.url().safeParse(value);
  if (!parsed.success) return false;
  const url = new URL(parsed.data);
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    publicHost(url.hostname.toLowerCase())
  );
}
export function browserAllows(target: BrowserTarget, value: string): boolean {
  if (target.kind === 'public') return publicBrowserUrl(value);
  if (target.kind === 'native-html') return nativeHtmlAllows(target, value);
  const parsed = z.url().safeParse(value);
  if (!parsed.success) return false;
  const url = new URL(parsed.data);
  return (
    url.protocol === 'https:' &&
    url.origin === target.origin &&
    url.username === '' &&
    url.password === ''
  );
}

function nativeHtmlAllows(
  target: Extract<BrowserTarget, { kind: 'native-html' }>,
  value: string,
): boolean {
  const url = z.url().safeParse(value);
  if (!url.success) return false;
  const parsed = new URL(url.data);
  parsed.hash = '';
  if (target.project !== true) return parsed.href === target.url;
  const origin = new URL(target.url);
  return (
    parsed.protocol === origin.protocol &&
    parsed.host === origin.host &&
    parsed.username === '' &&
    parsed.password === ''
  );
}
