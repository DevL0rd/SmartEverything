import { z } from 'zod';
import {
  RELEASE_ARTIFACT,
  RELEASE_ARTIFACTS,
  RELEASE_DEFAULT_SOURCE,
  RELEASE_SOURCE,
  type ReleaseArtifact,
  type ReleaseSource,
} from './release-sources';
import type { PipelineComponent } from './self-update';

const SETTING_ID_PREFIX = 'updates.buildSource.';

export function buildSourceSettingId(artifact: ReleaseArtifact): string {
  return `${SETTING_ID_PREFIX}${artifact}`;
}

export const BUILD_SOURCE_SETTING_VALUE = z.strictObject({ source: RELEASE_SOURCE }).readonly();

export type BuildSourceSettingValue = z.infer<typeof BUILD_SOURCE_SETTING_VALUE>;

export const BUILD_SOURCE_SETTINGS = z
  .strictObject({
    hub: RELEASE_SOURCE,
    apk: RELEASE_SOURCE,
    ui: RELEASE_SOURCE,
    desktop: RELEASE_SOURCE,
  })
  .readonly();

export type BuildSourceSettings = z.infer<typeof BUILD_SOURCE_SETTINGS>;

export const DEFAULT_BUILD_SOURCES: BuildSourceSettings = {
  hub: RELEASE_DEFAULT_SOURCE,
  apk: RELEASE_DEFAULT_SOURCE,
  ui: RELEASE_DEFAULT_SOURCE,
  desktop: RELEASE_DEFAULT_SOURCE,
};

export const BUILD_SOURCE_SETTINGS_UPDATE = z
  .strictObject({
    hub: RELEASE_SOURCE.optional(),
    apk: RELEASE_SOURCE.optional(),
    ui: RELEASE_SOURCE.optional(),
    desktop: RELEASE_SOURCE.optional(),
  })
  .refine((update) => Object.values(update).some((source) => source !== undefined), {
    message: 'name at least one artifact and its build source',
  })
  .readonly();

export type BuildSourceSettingsUpdate = z.infer<typeof BUILD_SOURCE_SETTINGS_UPDATE>;

export function releaseArtifactOf(component: PipelineComponent): ReleaseArtifact {
  return component === 'app' ? RELEASE_ARTIFACT.enum.apk : component;
}

export function buildSourcesFrom(
  read: (artifact: ReleaseArtifact) => ReleaseSource,
): BuildSourceSettings {
  return BUILD_SOURCE_SETTINGS.parse(
    Object.fromEntries(RELEASE_ARTIFACTS.map((artifact) => [artifact, read(artifact)])),
  );
}
