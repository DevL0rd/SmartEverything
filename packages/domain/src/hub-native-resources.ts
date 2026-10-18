import { z } from 'zod';
import { NATIVE_HUB_CREDENTIAL_BINDING } from './hub-native';

export const NATIVE_HUB_RESOURCE_PURPOSE = z.enum(['image', 'audio', 'recording', 'attachment']);
export type NativeHubResourcePurpose = z.infer<typeof NATIVE_HUB_RESOURCE_PURPOSE>;
export const NATIVE_HUB_RESOURCE_OPEN = z.strictObject({
  scopeId: z.string().min(1),
  binding: NATIVE_HUB_CREDENTIAL_BINDING,
  routeGeneration: z.int().nonnegative().optional(),
  url: z.url({ protocol: /^https?$/ }),
  expiresAt: z.iso.datetime(),
  purpose: NATIVE_HUB_RESOURCE_PURPOSE,
});
export type NativeHubResourceOpen = z.infer<typeof NATIVE_HUB_RESOURCE_OPEN>;
export const NATIVE_HUB_RESOURCE_ID = z.string().regex(/^[0-9a-f]{64}$/);
export const NATIVE_HUB_RESOURCE = z
  .object({
    id: NATIVE_HUB_RESOURCE_ID,
    localUrl: z.url().refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === 'http:' &&
        url.hostname === '127.0.0.1' &&
        Number(url.port) > 0 &&
        url.username === '' &&
        url.password === '' &&
        url.search === '' &&
        url.hash === '' &&
        /^\/resource\/[0-9a-f]{64}$/.test(url.pathname)
      );
    }, 'Resource presentation must be an exact loopback grant'),
    expiresAt: z.iso.datetime(),
  })
  .refine(
    (resource) => new URL(resource.localUrl).pathname === `/resource/${resource.id}`,
    'Resource ID must match its exact presentation path',
  );
export type NativeHubResource = z.infer<typeof NATIVE_HUB_RESOURCE>;
export const NATIVE_HUB_RESOURCE_DOWNLOAD = z.strictObject({
  id: NATIVE_HUB_RESOURCE_ID,
  intent: z.enum(['open', 'save']),
});
export type NativeHubResourceDownload = z.infer<typeof NATIVE_HUB_RESOURCE_DOWNLOAD>;

export const NATIVE_HUB_RESOURCE_DOWNLOAD_RESULT = z.enum(['completed', 'cancelled']);
export type NativeHubResourceDownloadResult = z.infer<typeof NATIVE_HUB_RESOURCE_DOWNLOAD_RESULT>;

export function nativeHubResourceIdentity(input: NativeHubResourceOpen): string {
  const url = new URL(input.url);
  return JSON.stringify([
    input.scopeId,
    NATIVE_HUB_CREDENTIAL_BINDING.parse(input.binding),
    input.purpose,
    url.origin,
    url.pathname,
    url.searchParams.get('size'),
  ]);
}
