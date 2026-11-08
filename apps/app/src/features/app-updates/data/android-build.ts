import {
  ANDROID_APP_BUILD,
  type AndroidAppBuild,
  type AndroidAppBuildReport,
} from '@smarteverything/domain';
import { requireOptionalNativeModule } from 'expo';
import { z } from 'zod';

const NATIVE_BUILD = z.object({
  applicationId: ANDROID_APP_BUILD.shape.applicationId,
  nativeBuildVersion: ANDROID_APP_BUILD.shape.versionCode,
});

export function androidBuild(): AndroidAppBuild | undefined {
  const parsed = NATIVE_BUILD.safeParse(requireOptionalNativeModule('ExpoApplication'));
  if (!parsed.success) return undefined;
  return { applicationId: parsed.data.applicationId, versionCode: parsed.data.nativeBuildVersion };
}

export function androidBuildReport(
  running: Omit<AndroidAppBuildReport, keyof AndroidAppBuild>,
): AndroidAppBuildReport | null {
  const build = androidBuild();
  return build === undefined ? null : { ...build, ...running };
}
