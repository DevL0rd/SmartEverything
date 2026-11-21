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
import { Logger } from '@smarteverything/logging';
import type { HubLayout } from '../data-layout';
import { StoreReader } from '../store/reader';
import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';

export class BuildSourceMissingError extends Error {
  override readonly name = 'BuildSourceMissingError';

  constructor(artifact: ReleaseArtifact) {
    super(
      `The build source setting for ${artifact} is missing; the build sources migration seeds it.`,
    );
  }
}

const STORED_SETTINGS = z.strictObject({ settings: z.string() });

function sourceOf(
  saved: Readonly<Record<string, unknown>> | null,
  artifact: ReleaseArtifact,
): ReleaseSource {
  if (saved === null) throw new BuildSourceMissingError(artifact);
  return BUILD_SOURCE_SETTING_VALUE.parse(saved).source;
}

function readBuildSources(store: Pick<HostStore, 'settingsKv'>): BuildSourceSettings {
  return buildSourcesFrom((artifact) =>
    sourceOf(store.settingsKv.read(buildSourceSettingId(artifact)), artifact),
  );
}

export const BUILD_SOURCES_UNIT = storeUnit((store, _input: null) => readBuildSources(store));

export const BUILD_SOURCES_UPDATE_UNIT = storeUnit(
  (store, update: BuildSourceSettingsUpdate): BuildSourceSettings => {
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
  },
);

const SETTING_TEXT = 'select settings from ai_settings where key = $key';

const BUSY_TIMEOUT_MS = 5000;

const log = new Logger('hub.self-update');

export function buildSourceSettingQuery(artifact: ReleaseArtifact): {
  readonly text: string;
  readonly key: string;
} {
  return { text: SETTING_TEXT, key: buildSourceSettingId(artifact) };
}

export function storedBuildSource(row: unknown, artifact: ReleaseArtifact): ReleaseSource {
  if (row === undefined) throw new BuildSourceMissingError(artifact);
  return BUILD_SOURCE_SETTING_VALUE.parse(JSON.parse(STORED_SETTINGS.parse(row).settings)).source;
}

export async function buildSourceOf(
  layout: HubLayout,
  component: PipelineComponent,
): Promise<ReleaseSource> {
  const artifact = releaseArtifactOf(component);
  const reader = new StoreReader({
    path: layout.system.database.file,
    busyTimeoutMs: BUSY_TIMEOUT_MS,
    log,
  });
  try {
    const { text, key } = buildSourceSettingQuery(artifact);
    const [row] = await reader.all(STORED_SETTINGS, text, { key });
    return storedBuildSource(row, artifact);
  } finally {
    await reader.close();
  }
}
