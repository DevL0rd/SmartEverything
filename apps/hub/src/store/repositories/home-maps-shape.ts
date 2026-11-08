import {
  HOME_MAP,
  HOME_MAP_ID,
  HOME_MAP_MAP_ID,
  HOME_MAP_REVISION_ENTRY,
  HOME_MAP_SCHEMA_VERSION,
  HOME_MAP_SOURCE,
  type HomeMap,
  type HomeMapActor,
  type HomeMapEditResult,
  type HomeMapId,
  type HomeMapSource,
  type HomeMapSummary,
  type HomeMapSummaryRow,
  type RowOperation,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';

export type HomeMapPublisher = (
  operation: RowOperation,
  summary: HomeMapSummaryRow | null,
  previous: HomeMapSummaryRow | null,
) => void;

export interface HomeMapRevisionFilter {
  readonly actor?: HomeMapActor;
  readonly after?: number;
  readonly mapId?: HomeMapId;
}

export interface HomeMapHistoryMark {
  readonly undoes?: number;
  readonly redoes?: number;
}

export interface HomeMapApplied extends HomeMapEditResult {
  readonly revision: number;
}

export interface HomeMapPatch {
  readonly name?: string;
  readonly isDefault?: true;
  readonly position?: number;
}

export interface HomeMapSourceLocation {
  readonly mapId: HomeMapId;
  readonly source: HomeMapSource;
}

export interface SetEntry {
  readonly id: HomeMapId;
  readonly position: number;
  readonly isDefault: boolean;
}

export interface Target {
  readonly id: HomeMapId;
  readonly before: HomeMap | null;
  readonly entry: SetEntry | null;
}

const DEFAULT_NAME = 'Home';

export const SET_ENTRY = storedRow(
  z.object({ id: HOME_MAP_MAP_ID, position: z.int().nonnegative(), isDefault: z.boolean() }),
  { flags: ['isDefault'] },
);
export const STORED_MAP = storedRow(z.object({ document: HOME_MAP }), { json: ['document'] });
export const STORED_REVISION = storedRow(
  HOME_MAP_REVISION_ENTRY.extend({
    undoes: z.int().positive().nullable(),
    redoes: z.int().positive().nullable(),
  }),
  { json: ['ops', 'inverse'] },
);
export const STORED_SOURCE = storedRow(z.object({ document: HOME_MAP_SOURCE }), {
  json: ['document'],
});
export const STORED_LOCATION = storedRow(
  z.object({ mapId: HOME_MAP_MAP_ID, document: HOME_MAP_SOURCE }),
  { json: ['document'] },
);
export const OWNER = z.object({ mapId: z.string() });

export const ENTRIES = `select id, position, is_default as isDefault from home_maps order by position, id`;
export const ENTRY = `select id, position, is_default as isDefault from home_maps where id = $id`;
export const DEFAULT_ENTRY = `select id, position, is_default as isDefault from home_maps where is_default = 1`;

export const READ = 'select document from home_maps where id = $id';

export const SAVE = `insert into home_maps (id, revision, document, updated_at, position, is_default)
  values ($id, $revision, $document, $updatedAt, $position, $isDefault)
  on conflict (id) do update
  set revision = excluded.revision, document = excluded.document, updated_at = excluded.updated_at`;

export const DELETE = 'delete from home_maps where id = $id';
export const SET_DEFAULT = 'update home_maps set is_default = $isDefault where id = $id';
export const SET_POSITION = 'update home_maps set position = $position where id = $id';

export const LOG = `insert into home_map_revisions (map_id, revision, ops, inverse, actor, at, undoes, redoes)
  values ($id, $revision, $ops, $inverse, $actor, $at, $undoes, $redoes)`;

export const REVISIONS = `select revision, ops, inverse, actor, at, undoes, redoes from home_map_revisions
  where map_id = $id and revision > $after and ($actor is null or actor = $actor)
  order by revision`;

export const SOURCES_OF_DEVICE = `select document from home_map_sources
  where map_id = $id and device_id = $deviceId order by source_id`;

export const SOURCE_LOCATIONS = `select map_id as mapId, document from home_map_sources
  where device_id = $deviceId order by map_id, source_id`;

export const ROBOT_MAP_OWNER = `select map_id as mapId from home_map_sources
  where device_id = $deviceId and robot_map_id = $robotMapId and map_id <> $id`;

export const CLEAR_SOURCES = 'delete from home_map_sources where map_id = $id';

export const ADD_SOURCE = `insert into home_map_sources (map_id, source_id, kind, device_id, document, robot_map_id)
  values ($id, $sourceId, $kind, $deviceId, $document, $robotMapId)`;

export const sourceLabel = (source: HomeMapSource): string =>
  source.robotMapName ?? source.frame.name ?? source.id;

export const roomsOf = (map: HomeMap): number =>
  map.floors.reduce((total, floor) => total + floor.rooms.length, 0);

export function summaryOf(
  map: HomeMap,
  set: Pick<SetEntry, 'position' | 'isDefault'>,
): HomeMapSummaryRow {
  return {
    id: map.id,
    revision: map.revision,
    name: map.name,
    floors: map.floors.length,
    position: set.position,
    isDefault: set.isDefault,
    fedBy: map.sources.map(sourceLabel),
    hasScan: map.scan !== undefined,
    updatedAt: map.updatedAt,
  };
}

export function listedOf(
  map: HomeMap,
  set: Pick<SetEntry, 'position' | 'isDefault'>,
): HomeMapSummary {
  return {
    id: map.id,
    name: map.name,
    revision: map.revision,
    floorNames: map.floors.map((floor) => floor.name),
    roomCount: roomsOf(map),
    isDefault: set.isDefault,
    position: set.position,
    fedBy: map.sources.map(sourceLabel),
    hasScan: map.scan !== undefined,
    updatedAt: map.updatedAt,
  };
}

export function emptyHomeMap(
  at: string,
  id: HomeMapId = HOME_MAP_ID,
  name = DEFAULT_NAME,
): HomeMap {
  return {
    id,
    schemaVersion: HOME_MAP_SCHEMA_VERSION,
    revision: 0,
    name,
    north: 0,
    floors: [],
    sources: [],
    notices: [],
    updatedAt: at,
  };
}

export function sourceProblem(map: HomeMap): string | null {
  const seen = new Set<string>();
  for (const source of map.sources) {
    const key = `${source.floorId}/${source.deviceId}`;
    if (seen.has(key)) return `Floor ${source.floorId} already has a source from that device.`;
    seen.add(key);
  }
  return null;
}
