import { z } from 'zod';
import { AI_HTML_PREVIEW_LEASE, AI_PREVIEW_HTML_MAX } from './ai-preview-documents';
import { NATIVE_HUB_CREDENTIAL_BINDING } from './hub-native';

export const AI_NATIVE_HTML_CAPABILITY = 'native-html-v1';
export const AI_NATIVE_PROJECT_CAPABILITY = 'native-project-v1';
export const NATIVE_PROJECT_ASSET_PATH = '/api/ai/previews/html/native/assets/:leaseId';
export const NATIVE_HTML_CLAIM_PATH = '/api/ai/previews/html/native/claim';
export const NATIVE_HTML_SCHEME = 'se-preview-html';
export const NATIVE_HTML_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; frame-ancestors 'none'; sandbox allow-scripts allow-same-origin allow-modals";
export const NATIVE_HTML_ID = z.string().regex(/^[0-9a-f]{64}$/);
export const NATIVE_HTML_LEASE = z.strictObject({
  purpose: z.literal('native-html'),
  id: NATIVE_HTML_ID,
  bootstrap_code: NATIVE_HTML_ID,
  publication_id: z.uuid(),
  revision: z.uuid(),
  profile_id: z.uuid(),
  expires_at: z.iso.datetime().nullable(),
});
export type NativeHtmlLease = z.infer<typeof NATIVE_HTML_LEASE>;
export type HtmlPresentationLease = NativeHtmlLease | z.infer<typeof AI_HTML_PREVIEW_LEASE>;
export const NATIVE_HTML_RETIRED = z.strictObject({ id: NATIVE_HTML_ID });
export const NATIVE_HTML_CLAIM = z.strictObject({
  chatId: z.uuid(),
  capability: z.literal('native-project-v1').optional(),
  lease: z.union([NATIVE_HTML_LEASE, AI_HTML_PREVIEW_LEASE]),
});
export type NativeHtmlClaim = z.infer<typeof NATIVE_HTML_CLAIM>;
export const NATIVE_HTML_DOCUMENT = z.strictObject({
  publicationId: z.uuid(),
  revision: z.uuid(),
  profileId: z.uuid(),
  expiresAt: z.iso.datetime().nullable(),
  html: z.string().max(AI_PREVIEW_HTML_MAX),
});
export const NATIVE_PROJECT_DOCUMENT = z.strictObject({
  kind: z.literal('project'),
  publicationId: z.uuid(),
  revision: z.uuid(),
  profileId: z.uuid(),
  expiresAt: z.iso.datetime().nullable(),
  leaseId: NATIVE_HTML_ID,
  assetToken: NATIVE_HTML_ID,
  entryPath: z.string().startsWith('/'),
});
export type NativeProjectDocument = z.output<typeof NATIVE_PROJECT_DOCUMENT>;
export const NATIVE_PREVIEW_DOCUMENT = z.union([NATIVE_HTML_DOCUMENT, NATIVE_PROJECT_DOCUMENT]);
export type NativePreviewDocument = z.output<typeof NATIVE_PREVIEW_DOCUMENT>;
export type NativeHtmlDocument = z.infer<typeof NATIVE_HTML_DOCUMENT>;
export const NATIVE_HTML_OPEN = z.strictObject({
  scopeId: z.string().min(1).max(200),
  binding: z.lazy(() => NATIVE_HUB_CREDENTIAL_BINDING),
  routeGeneration: z.int().nonnegative(),
  authorization: z.string().min(1).max(4096),
  claim: NATIVE_HTML_CLAIM,
});
export type NativeHtmlOpen = z.infer<typeof NATIVE_HTML_OPEN>;
export const NATIVE_HTML_PROJECTION = z
  .object({
    id: NATIVE_HTML_ID,
    project: z.literal(true).optional(),
    url: z.url().refine((value) => {
      const url = new URL(value);
      const custom =
        url.protocol === `${NATIVE_HTML_SCHEME}:` &&
        /^[0-9a-f]{64}$/.test(url.hostname) &&
        url.port === '' &&
        /^\/(?!\/)/u.test(url.pathname);
      const loopback =
        url.protocol === 'http:' &&
        url.hostname === '127.0.0.1' &&
        Number(url.port) > 0 &&
        /^\/(?!\/)/u.test(url.pathname);
      return (
        (custom || loopback) &&
        [url.search, url.hash, url.username, url.password].every((part) => part === '')
      );
    }),
    expiresAt: z.iso.datetime().nullable(),
  })
  .refine((projection) => {
    const url = new URL(projection.url);
    return url.protocol === `${NATIVE_HTML_SCHEME}:`
      ? url.hostname === projection.id
      : projection.project === true || url.pathname === `/${projection.id}/`;
  }, 'Native HTML identity must match its exact presentation URL')
  .refine((projection) => {
    const url = new URL(projection.url);
    return (
      projection.project === true ||
      url.protocol !== `${NATIVE_HTML_SCHEME}:` ||
      url.pathname === '/'
    );
  }, 'Native HTML identity must match its exact presentation URL');
export type NativeHtmlProjection = z.infer<typeof NATIVE_HTML_PROJECTION>;
export interface NativeHtmlPreview {
  supported(): boolean;
  lifetimeVersion?(): number;
  projectVersion?(): number;
  open(input: NativeHtmlOpen): Promise<NativeHtmlProjection>;
  release(id: string): Promise<void>;
}
