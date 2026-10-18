import {
  SCENE_ACTIONS,
  SNAPSHOT_ONLY_AREAS,
  SNAPSHOT_TABLES,
  TABLE_AREAS,
  areaInScope,
  type AccessScopes,
  type ClientRow,
  type SnapshotTables,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { reachableRows, scopesOfClient } from './person-scope';

export function sceneDeviceIds(actions: unknown): string[] {
  const parsed = SCENE_ACTIONS.safeParse(actions);
  if (!parsed.success) return [];
  return parsed.data.map((action) => action.deviceId);
}

function withoutAreas(tables: SnapshotTables, scopes: AccessScopes): SnapshotTables {
  const missing = new Set(
    [...Object.entries(TABLE_AREAS), ...Object.entries(SNAPSHOT_ONLY_AREAS)]
      .filter(([, area]) => !areaInScope(scopes, area))
      .map(([table]) => table),
  );
  if (missing.size === 0) return tables;
  return SNAPSHOT_TABLES.parse(
    Object.fromEntries(
      Object.entries(tables).flatMap(([table, value]) => {
        if (!missing.has(table)) return [[table, value]];
        return Array.isArray(value) ? [[table, []]] : [];
      }),
    ),
  );
}

export function reachableSnapshot(
  store: Store,
  client: ClientRow,
  tables: SnapshotTables,
): SnapshotTables {
  const scopes = scopesOfClient(store, client);
  if (scopes === null) return tables;
  return withoutAreas(devicesReached(store, scopes.devices, tables), scopes);
}

function devicesReached(
  store: Store,
  scope: AccessScopes['devices'],
  tables: SnapshotTables,
): SnapshotTables {
  const rows = <R>(list: readonly R[], deviceOf: (row: R) => string | null): R[] =>
    reachableRows(store, scope, list, deviceOf);
  const remotes = rows(tables.ir_remotes, (remote) => remote.blaster_id);
  const remoteIds = new Set(remotes.map((remote) => remote.id));
  return {
    ...tables,
    cameras: rows(tables.cameras, (camera) => camera.device_id),
    recordings: rows(tables.recordings, (recording) => recording.device_id),
    events: rows(tables.events, (event) => event.device_id),
    commands: rows(tables.commands, (command) => command.device_id),
    ir_remotes: remotes,
    ir_codes: tables.ir_codes.filter((code) => remoteIds.has(code.remote_id)),
    ...(tables.device_groups === undefined
      ? {}
      : {
          device_groups: tables.device_groups.filter(
            (group) => rows(group.device_ids, (id) => id).length === group.device_ids.length,
          ),
        }),
    scenes: tables.scenes.filter((scene) => {
      const ids = sceneDeviceIds(scene.actions);
      return rows(ids, (id) => id).length === ids.length;
    }),
  };
}
