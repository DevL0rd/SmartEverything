import type { LogPayload } from '@smarteverything/logging';
import type { Sql } from '../sql';
import type { Migration } from './migration';

const VACUUM_MODEL = 'xiaomi.vacuum.pv11gl';

const CAMERA_SWITCH = 'raw:21.6';

const VACUUM_DEVICES = `select id from devices where provider = 'xiaomi' and model = $model`;

export function moveCameraSwitchState(sql: Sql): LogPayload {
  const parameters = { model: VACUUM_MODEL, capability: CAMERA_SWITCH };
  const moved = sql.run(
    'move the vacuum camera switch state from power to its own key',
    `update or ignore device_state set capability = $capability
     where capability = 'power' and device_id in (${VACUUM_DEVICES})`,
    parameters,
  );
  const replaced = sql.run(
    'drop the old power state the vacuum camera switch already has under its own key',
    `delete from device_state where capability = 'power' and device_id in (${VACUUM_DEVICES})`,
    { model: VACUUM_MODEL },
  );
  const history = sql.run(
    'move the vacuum camera switch history from power to its own key',
    `update state_history set capability = $capability
     where capability = 'power' and device_id in (${VACUUM_DEVICES})`,
    parameters,
  );
  return { moved, replaced, history };
}

export const VACUUM_MIGRATION: Migration = {
  version: 140,
  name: 'vacuum',
  statements: [
    `create table vacuum_scenes (
      device_id text not null references devices (id) on delete cascade,
      slot text not null check (slot in ('current', 'saved', 'backup')),
      map_index integer not null,
      scene text not null check (json_valid(scene) and json_type(scene) = 'object'),
      fetched_at text not null,
      primary key (device_id, slot, map_index)
    ) strict, without rowid`,
    `create table vacuum_cleans (
      device_id text not null references devices (id) on delete cascade,
      id text not null check (length(id) > 0),
      started_at text not null,
      ended_at text,
      seconds integer not null check (seconds >= 0),
      area_m2 real not null check (area_m2 >= 0),
      scope text,
      mode text,
      rooms text not null check (json_valid(rooms) and json_type(rooms) = 'array'),
      outcome text,
      battery_start real check (battery_start is null or battery_start between 0 and 100),
      battery_end real check (battery_end is null or battery_end between 0 and 100),
      map_index integer,
      zones text not null check (json_valid(zones) and json_type(zones) = 'array'),
      trail text not null check (json_valid(trail) and json_type(trail) = 'array'),
      primary key (device_id, id)
    ) strict, without rowid`,
    'create index vacuum_cleans_started_idx on vacuum_cleans (device_id, started_at)',
  ],
  backfill: moveCameraSwitchState,
};
