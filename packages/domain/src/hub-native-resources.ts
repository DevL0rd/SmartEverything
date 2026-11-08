import { z } from 'zod';
import { ANDROID_APP_BUILD, APP_UPDATE_FILE, APP_UPDATE_SUMMARY } from './app-updates';
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

export const NATIVE_ANDROID_UPDATE_INSTALL = z.strictObject({
  id: NATIVE_HUB_RESOURCE_ID,
  releaseId: APP_UPDATE_SUMMARY.shape.id,
  build: ANDROID_APP_BUILD,
  size: z.int().positive(),
  sha256: APP_UPDATE_FILE.shape.sha256,
});
export type NativeAndroidUpdateInstall = z.infer<typeof NATIVE_ANDROID_UPDATE_INSTALL>;

export const NATIVE_ANDROID_UPDATE_STAGES = [
  'downloading',
  'verifying',
  'waiting_for_android',
] as const;
export type NativeAndroidUpdateStage = (typeof NATIVE_ANDROID_UPDATE_STAGES)[number];

export const NATIVE_ANDROID_UPDATE_PROGRESS = z.strictObject({
  id: NATIVE_HUB_RESOURCE_ID,
  stage: z.enum(NATIVE_ANDROID_UPDATE_STAGES),
  received: z.int().nonnegative(),
  total: z.int().positive(),
});
export type NativeAndroidUpdateProgress = z.infer<typeof NATIVE_ANDROID_UPDATE_PROGRESS>;

export const NATIVE_ANDROID_UPDATE_CANCEL = z.strictObject({ id: NATIVE_HUB_RESOURCE_ID });
export type NativeAndroidUpdateCancel = z.infer<typeof NATIVE_ANDROID_UPDATE_CANCEL>;

export const NATIVE_ANDROID_UPDATE_RESULT = z.discriminatedUnion('result', [
  z.strictObject({ result: z.literal('installed') }),
  z.strictObject({ result: z.literal('cancelled') }),
  z.strictObject({
    result: z.literal('failed'),
    status: z.int(),
    message: z.string().trim().min(1).nullable(),
  }),
]);
export type NativeAndroidUpdateResult = z.infer<typeof NATIVE_ANDROID_UPDATE_RESULT>;

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
