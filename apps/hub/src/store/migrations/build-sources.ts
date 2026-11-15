import {
  BUILD_SOURCE_SETTING_VALUE,
  DEFAULT_BUILD_SOURCES,
  RELEASE_ARTIFACTS,
  buildSourceSettingId,
} from '@smarteverything/domain';
import type { Sql } from '../sql';
import { jsonText } from '../sql';
import type { Migration } from './migration';

function seedBuildSources(sql: Sql, now: string): Readonly<Record<string, number>> {
  for (const artifact of RELEASE_ARTIFACTS) {
    sql.run(
      'seed the build source setting',
      'insert into ai_settings (key, settings, updated_at) values ($key, $settings, $now)',
      {
        key: buildSourceSettingId(artifact),
        settings: jsonText(
          BUILD_SOURCE_SETTING_VALUE.parse({ source: DEFAULT_BUILD_SOURCES[artifact] }),
        ),
        now,
      },
    );
  }
  return { settings: RELEASE_ARTIFACTS.length };
}

export const BUILD_SOURCES_MIGRATION: Migration = {
  version: 210,
  name: 'build-sources',
  statements: [],
  backfill: seedBuildSources,
};
