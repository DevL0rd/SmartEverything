import { z } from 'zod';
import {
  ANDROID_APP_BUILD,
  APP_UPDATE_CHANNELS,
  APP_UPDATE_FILE,
  APP_UPDATE_SUMMARY,
} from './app-updates';

export const ANDROID_APK_DIRECTORY = 'android-apks';
export const ANDROID_APK_INDEX_FILE = 'index.json';
export const ANDROID_APK_CONTENT_TYPE = 'application/vnd.android.package-archive';
export const ANDROID_APK_ABIS = ['arm64-v8a', 'x86_64'] as const;
export const ANDROID_APK_SCOPE = z.union([z.uuid(), z.literal('shared')]);

const ANDROID_APK_ARTIFACT = APP_UPDATE_SUMMARY.extend({
  clientId: z.uuid().nullable(),
  build: ANDROID_APP_BUILD,
  runtimeVersion: z.string().min(1),
  channel: z.enum(APP_UPDATE_CHANNELS),
  abis: z.array(z.enum(ANDROID_APK_ABIS)).min(1),
  sha256: APP_UPDATE_FILE.shape.sha256,
});

export const ANDROID_APK_RELEASE = ANDROID_APK_ARTIFACT.refine(
  (release) =>
    release.clientId !== null || ANDROID_APK_ABIS.every((abi) => release.abis.includes(abi)),
);

export type AndroidApkRelease = z.infer<typeof ANDROID_APK_RELEASE>;

export const ANDROID_APK_BASELINE = ANDROID_APK_ARTIFACT.pick({
  build: true,
  runtimeVersion: true,
  channel: true,
  sha256: true,
  size: true,
}).extend({ clientId: z.uuid() });

export type AndroidApkBaseline = z.infer<typeof ANDROID_APK_BASELINE>;

export const ANDROID_APK_INDEX = z.strictObject({ entries: z.array(ANDROID_APK_RELEASE) });
export type AndroidApkIndex = z.infer<typeof ANDROID_APK_INDEX>;
