import type { Migration } from './migration';

export const VACUUM_ROOM_LINKS_MIGRATION: Migration = {
  version: 141,
  name: 'vacuum-room-links',
  statements: [
    `create table vacuum_room_links (
      device_id text not null references devices (id) on delete cascade,
      map_room_id integer not null,
      room_id text not null references rooms (id) on delete cascade,
      map_room_name text not null,
      linked_at text not null,
      missing_since text,
      primary key (device_id, map_room_id),
      unique (device_id, room_id)
    ) strict, without rowid`,
    'create index vacuum_room_links_room_idx on vacuum_room_links (room_id)',
  ],
};
