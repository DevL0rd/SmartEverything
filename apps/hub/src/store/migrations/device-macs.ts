import type { Migration } from './migration';

export const DEVICE_MACS_MIGRATION: Migration = {
  version: 139,
  name: 'device_macs',
  statements: [
    `create table device_macs (
      device_id text primary key references devices (id) on delete cascade,
      mac_address text not null check (mac_address glob '[0-9a-f][0-9a-f]:[0-9a-f][0-9a-f]:[0-9a-f][0-9a-f]:[0-9a-f][0-9a-f]:[0-9a-f][0-9a-f]:[0-9a-f][0-9a-f]'),
      learned_at text not null
    ) strict`,
  ],
};
