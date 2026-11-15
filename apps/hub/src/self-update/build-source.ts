import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  BUILD_SOURCE_SETTING_VALUE,
  BUILD_SOURCE_SETTINGS,
  buildSourceSettingId,
  buildSourcesFrom,
  RELEASE_ARTIFACTS,
  releaseArtifactOf,
  type BuildSourceSettings,
  type BuildSourceSettingsUpdate,
  type PipelineComponent,
  type ReleaseArtifact,
  type ReleaseSource,
} from '@smarteverything/domain';
import type { HubLayout } from '../data-layout';
import type { Store } from '../store/store';

export class BuildSourceMissingError extends Error {
  override readonly name = 'BuildSourceMissingError';

  constructor(artifact: ReleaseArtifact) {
    super(
      `The build source setting for ${artifact} is missing; the build sources migration seeds it.`,
    );
  }
}

const STORED_SETTINGS = z.strictObject({ settings: z.string() });

type SettingsStore = Pick<Store, 'settingsKv' | 'write'>;

function sourceOf(
  saved: Readonly<Record<string, unknown>> | null,
  artifact: ReleaseArtifact,
): ReleaseSource {
  if (saved === null) throw new BuildSourceMissingError(artifact);
  return BUILD_SOURCE_SETTING_VALUE.parse(saved).source;
}

export function readBuildSources(store: Pick<Store, 'settingsKv'>): BuildSourceSettings {
  return buildSourcesFrom((artifact) =>
    sourceOf(store.settingsKv.read(buildSourceSettingId(artifact)), artifact),
  );
}

export function updateBuildSources(
  store: SettingsStore,
  update: BuildSourceSettingsUpdate,
): BuildSourceSettings {
  return store.write(() => {
    const current = readBuildSources(store);
    const next = BUILD_SOURCE_SETTINGS.parse({
      ...current,
      ...Object.fromEntries(Object.entries(update).filter(([, source]) => source !== undefined)),
    });
    for (const artifact of RELEASE_ARTIFACTS) {
      const source = next[artifact];
      if (source !== current[artifact])
        store.settingsKv.save(buildSourceSettingId(artifact), { source });
    }
    return next;
  });
}

export function buildSourceOf(layout: HubLayout, component: PipelineComponent): ReleaseSource {
  const artifact = releaseArtifactOf(component);
  const database = new DatabaseSync(layout.system.database.file, { readOnly: true });
  try {
    const row = database
      .prepare('select settings from ai_settings where key = ?')
      .get(buildSourceSettingId(artifact));
    if (row === undefined) throw new BuildSourceMissingError(artifact);
    return BUILD_SOURCE_SETTING_VALUE.parse(JSON.parse(STORED_SETTINGS.parse({ ...row }).settings))
      .source;
  } finally {
    database.close();
  }
}
