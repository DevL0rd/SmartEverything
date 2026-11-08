import {
  HOME_MAP,
  HOME_MAP_VERSION,
  type HomeMap,
  type HomeMapId,
  type HomeMapVersion,
  type HomeMapVersionId,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { jsonText } from '../sql';

export interface HomeMapVersionSnapshot {
  readonly version: HomeMapVersion;
  readonly document: HomeMap;
}

const STORED_VERSION = storedRow(HOME_MAP_VERSION, {});

const STORED_SNAPSHOT = storedRow(HOME_MAP_VERSION.and(z.object({ document: HOME_MAP })), {
  json: ['document'],
});

const COLUMNS = `map_id as mapId, version_id as versionId, name, created_at as createdAt, actor`;

const SAVE = `insert into home_map_versions (map_id, version_id, name, document, created_at, actor)
  values ($mapId, $versionId, $name, $document, $createdAt, $actor)`;

const LIST = `select ${COLUMNS} from home_map_versions where map_id = $mapId
  order by created_at desc, version_id desc`;

const READ = `select ${COLUMNS}, document from home_map_versions
  where map_id = $mapId and version_id = $versionId`;

const REMOVE = 'delete from home_map_versions where map_id = $mapId and version_id = $versionId';

export class HomeMapVersionsRepository {
  constructor(private readonly context: StoreContext) {}

  save(mapId: HomeMapId, document: HomeMap, name: string | null, actor: string): HomeMapVersion {
    return this.context.write(() => {
      const versionId = this.context.newId();
      const createdAt = this.context.now();
      this.context.sql.run('save a home map version', SAVE, {
        mapId,
        versionId,
        name,
        document: jsonText(document),
        createdAt,
        actor,
      });
      return HOME_MAP_VERSION.parse({ mapId, versionId, name, createdAt, actor });
    });
  }

  list(mapId: HomeMapId): HomeMapVersion[] {
    return this.context.sql.all(STORED_VERSION, LIST, { mapId });
  }

  read(mapId: HomeMapId, versionId: HomeMapVersionId): HomeMapVersionSnapshot | null {
    const row = this.context.sql.get(STORED_SNAPSHOT, READ, { mapId, versionId });
    if (row === undefined) return null;
    const { document, ...rest } = row;
    return { version: HOME_MAP_VERSION.parse(rest), document };
  }

  remove(mapId: HomeMapId, versionId: HomeMapVersionId): boolean {
    return (
      this.context.write(() =>
        this.context.sql.run('remove a home map version', REMOVE, { mapId, versionId }),
      ) > 0
    );
  }
}
