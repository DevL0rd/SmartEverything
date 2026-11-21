import { DatabaseSync } from 'node:sqlite';
import {
  releaseArtifactOf,
  type PipelineComponent,
  type ReleaseSource,
} from '@smarteverything/domain';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import {
  buildSourceSettingQuery,
  storedBuildSource,
} from '../apps/hub/src/self-update/build-source.ts';

export function buildSourceOf(layout: HubLayout, component: PipelineComponent): ReleaseSource {
  const artifact = releaseArtifactOf(component);
  const database = new DatabaseSync(layout.system.database.file, { readOnly: true });
  try {
    const { text, key } = buildSourceSettingQuery(artifact);
    const row = database.prepare(text).get({ key });
    return storedBuildSource(row === undefined ? undefined : { ...row }, artifact);
  } finally {
    database.close();
  }
}
